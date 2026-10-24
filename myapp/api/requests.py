import csv
import io
import os
import uuid
from datetime import date, datetime, timedelta

from flask import Response, current_app, jsonify, request, send_from_directory
from flask_login import current_user, login_required
from sqlalchemy.exc import IntegrityError
from werkzeug.utils import secure_filename

from myapp.api import api_bp
from myapp.api.utils import EMAIL_RE, ApiError, controller_required, requester_required, clean, error, frontend_url, paginate, payload, send_email
from myapp.models import (STATUS_TRANSITIONS, RETIRED_ID_CARDS, ApprovalStatusEnum, IDCardEnum, UserRequest, db,
                          display_filename)

TEXT_FIELDS = {
    # api name: (model attribute, max length)
    'fullname': ('fullname', 200),
    'company': ('company', 200),
    'job_title': ('job_role', 200),
    'country': ('country', 100),
    'host': ('host', 200),
    'email': ('email_address', 100),
    'phone': ('phone_number', 100),
    'purpose': ('purpose', 250),
}
# Everything else is optional; job title is also required for a Permanent ID (see _validate_for_submit).
REQUIRED_ON_SUBMIT = ['fullname', 'id_card', 'country', 'expected_date', 'departure_date', 'purpose']



# --------------------------------------------------------------------------- helpers

def is_shi_mci(company):
    """True for SHI-MCI, ignoring case, spaces and hyphens."""
    return ''.join(ch for ch in (company or '').lower() if ch.isalnum()) == 'shimci'


# Only SHI-MCI visitors need an ID card and job title.
needs_id_card = is_shi_mci

MIN_NOTICE_DAYS = 2  # "48 hours" on calendar dates: arrival on or after the day after tomorrow


def _parse_date(value, field):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ApiError('Invalid date.', 422, {field: 'Use the format YYYY-MM-DD.'})


def _get_request_or_404(request_id):
    req = db.session.get(UserRequest, request_id)
    if not req:
        raise ApiError('Request not found.', 404)
    if req.user_id != current_user.user_id and not current_user.can_view_all_requests:
        raise ApiError('Request not found.', 404)
    # Admins do not see other users' unsent drafts.
    if req.status == ApprovalStatusEnum.DRAFT and req.user_id != current_user.user_id:
        raise ApiError('Request not found.', 404)
    return req


def _get_own_draft(request_id):
    req = _get_request_or_404(request_id)
    if req.user_id != current_user.user_id or req.status != ApprovalStatusEnum.DRAFT:
        raise ApiError('Only your own drafts can be changed.', 409)
    return req


def _apply_fields(req, data):
    problems = {}
    for api_name, (attr, max_len) in TEXT_FIELDS.items():
        if api_name in data:
            value = clean(data.get(api_name))
            if len(value) > max_len:
                problems[api_name] = f'Must be at most {max_len} characters.'
            setattr(req, attr, value[:max_len])
    if 'email' in data and req.email_address and not EMAIL_RE.match(req.email_address):
        problems['email'] = 'Enter a valid email address.'
    if 'id_card' in data:
        value = data.get('id_card')
        if value in IDCardEnum.__members__ and IDCardEnum[value] not in RETIRED_ID_CARDS:
            req.id_card = IDCardEnum[value]
        elif value in IDCardEnum.__members__:
            problems['id_card'] = 'This ID card option is no longer available. Choose another.'
        elif value:
            problems['id_card'] = 'Choose a valid ID card option.'
    if 'expected_date' in data:
        req.expected_date = _parse_date(data.get('expected_date'), 'expected_date')
    if 'departure_date' in data:
        req.departure_date = _parse_date(data.get('departure_date'), 'departure_date')
    if req.expected_date and req.departure_date:
        if req.departure_date < req.expected_date:
            problems['departure_date'] = 'Departure must be on or after the expected date.'
        else:
            req.duration = str((req.departure_date - req.expected_date).days + 1)
    else:
        req.duration = ''
    if not needs_id_card(req.company):
        # Only collected for SHI-MCI; drop anything left over from before the company was chosen.
        req.id_card, req.job_role = None, ''
        problems.pop('id_card', None)
    if problems:
        raise ApiError('Please fix the highlighted fields.', 422, problems)


def _validate_for_submit(req, allow_backdate=False):
    """Check a request is complete before it goes for review.

    allow_backdate: a request filled in and submitted in one go (single or group)
    may have an arrival date in the past; a saved draft may not.
    """
    problems = {}
    for name in REQUIRED_ON_SUBMIT:
        if name == 'id_card' and not needs_id_card(req.company):
            continue
        attr = TEXT_FIELDS[name][0] if name in TEXT_FIELDS else name
        if not getattr(req, attr):
            problems[name] = 'This field is required.'
    if req.id_card == IDCardEnum.parmanent and not req.job_role:
        problems['job_title'] = 'Job title is required for a Permanent ID.'
    if req.id_card in RETIRED_ID_CARDS:
        # Old drafts may still carry the retired plain "Visitor ID".
        problems['id_card'] = 'Choose one of the current ID card options.'
    today = date.today()
    if req.expected_date and not is_shi_mci(req.company):
        # Everyone except SHI-MCI must give 48 hours' notice; no back-dating.
        earliest = today + timedelta(days=MIN_NOTICE_DAYS)
        if req.expected_date < earliest:
            problems['expected_date'] = (f'Arrival must be at least 48 hours from now (on or after '
                                         f'{earliest:%d %b %Y}). Only SHI-MCI requests can be sooner.')
    elif req.expected_date and req.expected_date < today and not allow_backdate:
        problems['expected_date'] = ('Arrival cannot be in the past for a saved draft. '
                                     'Only a new request can be back-dated.')
    if req.departure_date and req.departure_date < today:
        problems['departure_date'] = 'Departure must be today or later.'
    if problems:
        raise ApiError('Please complete the highlighted fields before submitting.', 422, problems)


def _save_uploads(req):
    files = [f for f in request.files.getlist('documents') if f and f.filename]
    if not files:
        return
    cfg = current_app.config
    allowed = cfg['ALLOWED_EXTENSIONS']
    if len(req.documents) + len(files) > cfg['MAX_FILES_PER_REQUEST']:
        raise ApiError(f"A request can have at most {cfg['MAX_FILES_PER_REQUEST']} documents.", 422,
                       {'documents': 'Too many files.'})
    total = 0
    for f in files:
        ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
        if ext not in allowed:
            raise ApiError(f'"{f.filename}" is not an allowed file type.', 422,
                           {'documents': 'Allowed: ' + ', '.join(sorted(allowed)).upper()})
        f.stream.seek(0, os.SEEK_END)
        total += f.stream.tell()
        f.stream.seek(0)
    if total > cfg['MAX_TOTAL_UPLOAD_BYTES']:
        raise ApiError('Total upload size exceeds 10MB.', 422, {'documents': 'Files are too large.'})

    names = list(req.documents)
    for f in files:
        stored = f'{uuid.uuid4().hex}_{secure_filename(f.filename) or "file"}'
        f.save(os.path.join(cfg['UPLOAD_FOLDER'], stored))
        names.append(stored)
    req.documents = names


def _remove_documents(req, names):
    if not names:
        return
    keep = [n for n in req.documents if n not in names]
    for name in set(req.documents) - set(keep):
        path = os.path.join(current_app.config['UPLOAD_FOLDER'], name)
        if os.path.isfile(path):
            os.remove(path)
    req.documents = keep


def _next_request_no():
    prefix = f"REQ-{datetime.now().strftime('%Y%m%d')}-"
    latest = (db.session.query(UserRequest.request_no)
              .filter(UserRequest.request_no.like(prefix + '%'))
              .order_by(UserRequest.request_no.desc()).first())
    seq = int(latest[0].rsplit('-', 1)[-1]) + 1 if latest else 1
    return f'{prefix}{seq:03d}'


def _submit(req, allow_backdate=False):
    _validate_for_submit(req, allow_backdate)
    for _ in range(5):
        req.status = ApprovalStatusEnum.PENDING
        req.submitted_at = datetime.utcnow()
        req.request_no = _next_request_no()
        try:
            db.session.commit()
            break
        except IntegrityError:
            # Another request took this number at the same moment; try the next one.
            db.session.rollback()
            db.session.add(req)
    else:
        raise ApiError('Could not allocate a request number. Please try again.', 503)
    _notify(req, 'submitted')


def _notify(req, event):
    link = frontend_url(f'requests/{req.request_id}')
    lines = [
        f'Your access request {req.request_no} has been {event}.',
        f'Status: {req.status.name}',
        f'Visitor: {req.fullname} ({req.company})',
        f'Expected date: {req.expected_date}',
    ]
    if req.review_note and event != 'submitted':
        lines.append(f'Note from reviewer: {req.review_note}')
    lines.append(f'View it here: {link}')
    recipients = {req.email_address, req.user.user_email if req.user else None}
    send_email(f'Access request {req.request_no} {event}', list(recipients), '\n'.join(lines))


def _filtered_query():
    scope = request.args.get('scope', 'mine')
    q = UserRequest.query
    if scope == 'all':
        if not current_user.can_view_all_requests:
            raise ApiError('You do not have access to all requests.', 403)
        q = q.filter(UserRequest.status != ApprovalStatusEnum.DRAFT)
        owner = request.args.get('user_id', type=int)
        if owner:
            q = q.filter(UserRequest.user_id == owner)
    else:
        q = q.filter(UserRequest.user_id == current_user.user_id)

    status = request.args.get('status')
    if status:
        if status not in ApprovalStatusEnum.__members__:
            raise ApiError('Unknown status filter.')
        q = q.filter(UserRequest.status == ApprovalStatusEnum[status])
    elif scope != 'all':
        q = q.filter(UserRequest.status != ApprovalStatusEnum.DRAFT)

    for arg, column, op in (
        ('expected_from', UserRequest.expected_date, 'ge'),
        ('departure_to', UserRequest.departure_date, 'le'),
        ('created_from', db.func.date(UserRequest.created_at), 'ge'),
        ('created_to', db.func.date(UserRequest.created_at), 'le'),
    ):
        value = _parse_date(request.args.get(arg), arg)
        if value:
            q = q.filter(column >= value if op == 'ge' else column <= value)

    group_no = clean(request.args.get('group_no'))
    if group_no:
        q = q.filter(UserRequest.group_no == group_no)

    id_card = request.args.get('id_card')
    if id_card:
        if id_card not in IDCardEnum.__members__:
            raise ApiError('Unknown ID card filter.')
        q = q.filter(UserRequest.id_card == IDCardEnum[id_card])

    search = clean(request.args.get('search'))
    if search:
        like = f'%{search}%'
        q = q.filter(db.or_(
            UserRequest.request_no.ilike(like),
            UserRequest.group_no.ilike(like),
            UserRequest.fullname.ilike(like),
            UserRequest.company.ilike(like),
            UserRequest.host.ilike(like),
        ))

    sort = request.args.get('sort', '-created_at')
    columns = {'created_at': UserRequest.created_at, 'expected_date': UserRequest.expected_date,
               'request_no': UserRequest.request_no, 'fullname': UserRequest.fullname,
               'submitted_at': UserRequest.submitted_at}
    column = columns.get(sort.lstrip('-'), UserRequest.created_at)
    return q.order_by(column.desc() if sort.startswith('-') else column.asc(), UserRequest.request_id.desc())


# --------------------------------------------------------------------------- read

@api_bp.get('/requests')
@login_required
def list_requests():
    page, meta = paginate(_filtered_query())
    return jsonify(items=[r.to_dict() for r in page.items], **meta)


@api_bp.get('/requests/export')
@login_required
def export_requests():
    rows = _filtered_query().all()
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(['Request No.', 'Group No.', 'Created By', 'Created', 'Full name', 'Company', 'Job title',
                     'Country', 'Host', 'Email', 'Phone',
                     'ID card', 'Expected', 'Departure', 'Days', 'Status'])
    for r in rows:
        writer.writerow([
            r.request_no or 'DRAFT', r.group_no or '', r.user.full_name if r.user else '',
            r.created_at.strftime('%Y-%m-%d') if r.created_at else '', r.fullname, r.company, r.job_role, r.country, r.host,
            r.email_address, r.phone_number, r.id_card.value if r.id_card else '', r.expected_date or '',
            r.departure_date or '', r.duration, r.status.name,
        ])
    filename = f"access_requests_{date.today().isoformat()}.csv"
    return Response(out.getvalue(), mimetype='text/csv',
                    headers={'Content-Disposition': f'attachment; filename={filename}'})


@api_bp.get('/requests/stats')
@login_required
def request_stats():
    scope = request.args.get('scope', 'mine')
    q = db.session.query(UserRequest.status, db.func.count(UserRequest.request_id))
    if scope == 'all':
        if not current_user.can_view_all_requests:
            return error('You do not have access to all requests.', 403)
        q = q.filter(UserRequest.status != ApprovalStatusEnum.DRAFT)
    else:
        q = q.filter(UserRequest.user_id == current_user.user_id)
    counts = {s.name: 0 for s in ApprovalStatusEnum}
    for status, count in q.group_by(UserRequest.status).all():
        if status:
            counts[status.name] = count
    total = sum(v for k, v in counts.items() if k != 'DRAFT')
    return jsonify(counts=counts, total=total)


@api_bp.get('/requests/<int:request_id>')
@login_required
def get_request(request_id):
    return jsonify(request=_get_request_or_404(request_id).to_dict(detail=True))


@api_bp.get('/requests/<int:request_id>/documents/<path:name>')
@login_required
def download_document(request_id, name):
    req = _get_request_or_404(request_id)
    if name not in req.documents:
        return error('Document not found.', 404)
    folder = current_app.config['UPLOAD_FOLDER']
    if not os.path.isfile(os.path.join(folder, name)):
        # Files uploaded by the old app lived under static/uploads.
        legacy = os.path.join(current_app.root_path, 'static', 'uploads')
        if os.path.isfile(os.path.join(legacy, name)):
            folder = legacy
    return send_from_directory(folder, name, download_name=display_filename(name),
                               as_attachment=request.args.get('download') == '1')


# --------------------------------------------------------------------------- write (owner)

@api_bp.post('/requests')
@requester_required
def create_request():
    data = payload()
    action = data.get('action', 'submit')
    req = UserRequest(user_id=current_user.user_id, status=ApprovalStatusEnum.DRAFT, request_no=None)
    _apply_fields(req, data)
    _save_uploads(req)
    db.session.add(req)
    db.session.flush()
    if action == 'submit':
        try:
            _submit(req, allow_backdate=True)
        except ApiError:
            db.session.rollback()
            _discard_uploads(req)
            raise
    else:
        db.session.commit()
    return jsonify(request=req.to_dict(detail=True)), 201


def _discard_uploads(req):
    for name in req.documents:
        # Group requests share files; keep any still attached to another request.
        shared = (UserRequest.query
                  .filter(UserRequest.request_id != req.request_id, UserRequest.document.contains(name))
                  .first())
        path = os.path.join(current_app.config['UPLOAD_FOLDER'], name)
        if not shared and os.path.isfile(path):
            os.remove(path)


@api_bp.put('/requests/<int:request_id>')
@requester_required
def update_draft(request_id):
    req = _get_own_draft(request_id)
    data = payload()
    _apply_fields(req, data)
    removed = request.form.getlist('remove_documents') if not request.is_json else data.get('remove_documents', [])
    _remove_documents(req, removed)
    _save_uploads(req)
    # Save the draft first so nothing is lost if submission validation fails.
    db.session.commit()
    if data.get('action') == 'submit':
        _submit(req)
    return jsonify(request=req.to_dict(detail=True))


@api_bp.delete('/requests/<int:request_id>')
@requester_required
def delete_request(request_id):
    """Owners delete their own drafts; an Access Controller can delete any request."""
    if current_user.is_controller:
        req = _get_request_or_404(request_id)
        current_app.logger.warning('Request %s (%s, %s) deleted by %s', req.request_no or f'draft {req.request_id}',
                                   req.fullname, req.status.name, current_user.user_email)
    else:
        req = _get_own_draft(request_id)
    _discard_uploads(req)
    db.session.delete(req)
    db.session.commit()
    return jsonify(ok=True)


@api_bp.post('/requests/submit-drafts')
@requester_required
def submit_drafts():
    ids = (payload().get('ids') or [])
    submitted, failed = [], []
    for request_id in ids:
        try:
            req = _get_own_draft(int(request_id))
            _submit(req)
            submitted.append(req.request_no)
        except (ApiError, ValueError) as e:
            db.session.rollback()
            failed.append({'id': request_id, 'error': getattr(e, 'message', 'Invalid id'),
                           'fields': list(getattr(e, 'fields', {}) or {})})
    return jsonify(submitted=submitted, failed=failed)


# --------------------------------------------------------------------------- review (admin)

def apply_review(req, target_name, note):
    """Move a submitted request to a new status as the current reviewer.

    Shared by single and group reviews so both enforce the same rules.
    Raises ApiError; does not commit or send email.
    """
    if target_name not in ApprovalStatusEnum.__members__:
        raise ApiError('Unknown status.')
    target = ApprovalStatusEnum[target_name]
    if req.user_id == current_user.user_id:
        raise ApiError('You cannot review your own request. Ask another Access Controller.', 403)
    if (target in (ApprovalStatusEnum.PENDING, ApprovalStatusEnum.APPROVED)
            and req.departure_date and req.departure_date < date.today()):
        raise ApiError('This visit has already ended. The visitor needs a new access request.', 409)
    if target not in STATUS_TRANSITIONS.get(req.status, ()):
        raise ApiError(f'A {req.status.name.lower()} request cannot be changed to {target.name.lower()}.', 409)
    note = clean(note)
    if target in (ApprovalStatusEnum.REJECTED, ApprovalStatusEnum.TERMINATED) and not note:
        raise ApiError('Please give a reason.', 422, {'note': 'A reason is required.'})
    req.status = target
    req.review_note = note or None
    req.reviewed_at = datetime.utcnow()
    req.reviewed_by_id = current_user.user_id
    return target


@api_bp.post('/requests/<int:request_id>/status')
@controller_required
def change_status(request_id):
    req = _get_request_or_404(request_id)
    data = payload()
    target = apply_review(req, data.get('status'), data.get('note'))
    db.session.commit()
    _notify(req, {'PENDING': 'reopened'}.get(target.name, target.name.lower()))
    return jsonify(request=req.to_dict(detail=True))
