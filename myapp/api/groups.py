"""Group requests: one form for a party of visitors, stored as one request per visitor.

Each visitor gets an ordinary UserRequest (own number, status and gate check);
they are linked by a shared group_no so they can be viewed and reviewed together.
"""
import json
from datetime import datetime

from flask import jsonify, request
from flask_login import current_user, login_required
from sqlalchemy.exc import IntegrityError

from myapp.api import api_bp
from myapp.api.requests import (
    _apply_fields, _discard_uploads, _save_uploads, _validate_for_submit, apply_review, needs_id_card,
)
from myapp.api.utils import ApiError, clean, controller_required, frontend_url, payload, requester_required, send_email
from myapp.models import STATUS_TRANSITIONS, ApprovalStatusEnum, UserRequest, db

MAX_GROUP_SIZE = 50
SHARED_FIELDS = ('host', 'purpose', 'expected_date', 'departure_date')
VISITOR_FIELDS = ('fullname', 'company', 'job_title', 'country', 'email', 'phone', 'id_card')
# Contact details are optional per visitor in a group; only the name is required.
OPTIONAL_VISITOR_FIELDS = ('email', 'phone')


def _next_seq(column, prefix):
    """Next free sequence number for values like '<prefix>007'."""
    latest = (db.session.query(column).filter(column.like(prefix + '%'))
              .order_by(column.desc()).first())
    return int(latest[0].rsplit('-', 1)[-1]) + 1 if latest else 1


def _parse_visitors(raw):
    try:
        visitors = json.loads(raw or '[]')
    except ValueError:
        raise ApiError('Visitor list is not valid.', 422)
    if not isinstance(visitors, list) or not all(isinstance(v, dict) for v in visitors):
        raise ApiError('Visitor list is not valid.', 422)
    visitors = [v for v in visitors if any(clean(v.get(f)) for f in VISITOR_FIELDS if f != 'id_card')]
    if not visitors:
        raise ApiError('Add at least one visitor.', 422, {'visitors': 'Add at least one visitor.'})
    if len(visitors) > MAX_GROUP_SIZE:
        raise ApiError(f'A group can have at most {MAX_GROUP_SIZE} visitors.', 422,
                       {'visitors': f'At most {MAX_GROUP_SIZE} visitors.'})
    return visitors


def _build_requests(shared, visitors):
    """Validate every visitor; return unsaved requests or raise with per-row errors."""
    problems, built = {}, []
    for i, visitor in enumerate(visitors):
        data = {**shared,
                'fullname': visitor.get('fullname'),
                'company': clean(visitor.get('company')) or shared.get('company'),
                'job_title': visitor.get('job_title'),
                'country': clean(visitor.get('country')) or shared.get('country'),
                'email': visitor.get('email'),
                'phone': visitor.get('phone'),
                'id_card': visitor.get('id_card') or shared.get('id_card')}
        req = UserRequest(user_id=current_user.user_id, status=ApprovalStatusEnum.DRAFT)
        for check in (lambda: _apply_fields(req, data), lambda: _validate_for_submit(req, allow_backdate=True)):
            try:
                check()
            except ApiError as e:
                for field, msg in e.fields.items():
                    if field in OPTIONAL_VISITOR_FIELDS and msg == 'This field is required.':
                        continue
                    # Shared fields are reported once, against the shared input. A missing ID card
                    # is the shared default's problem unless the row chose its own.
                    # A missing ID card goes on the row unless the default ID card is shown (SHI-MCI default company).
                    shared_error = field in SHARED_FIELDS or (
                        field in ('id_card', 'country') and not clean(visitor.get(field))
                        and not (field == 'id_card' and not needs_id_card(shared.get('company'))))
                    key = field if shared_error else f'visitors.{i}.{field}'
                    problems.setdefault(key, msg)
        built.append(req)
    if problems:
        raise ApiError('Please fix the highlighted fields.', 422, problems)
    return built


def _group_or_404(group_no):
    reqs = (UserRequest.query.filter(UserRequest.group_no == group_no)
            .order_by(UserRequest.request_no).all())
    if not reqs or (reqs[0].user_id != current_user.user_id and not current_user.can_view_all_requests):
        raise ApiError('Group not found.', 404)
    return reqs


def _group_summary(reqs):
    first = reqs[0]
    counts = {}
    for r in reqs:
        counts[r.status.name] = counts.get(r.status.name, 0) + 1
    return {
        'group_no': first.group_no,
        'created_by': {'id': first.user.user_id, 'full_name': first.user.full_name, 'email': first.user.user_email}
        if first.user else None,
        'submitted_at': first.submitted_at.isoformat() if first.submitted_at else None,
        'host': first.host,
        'purpose': first.purpose,
        'expected_date': first.expected_date.isoformat() if first.expected_date else None,
        'departure_date': first.departure_date.isoformat() if first.departure_date else None,
        'size': len(reqs),
        'counts': counts,
        'requests': [dict(r.to_dict(), allowed_transitions=[s.name for s in STATUS_TRANSITIONS.get(r.status, ())])
                     for r in reqs],
    }


def _email_requester(reqs, subject, intro, note=None):
    first = reqs[0]
    if not first.user:
        return
    lines = [intro, f'Group: {first.group_no}', f'Visit: {first.expected_date} to {first.departure_date}', '']
    lines += [f'  {r.request_no}  {r.fullname} ({r.company}) - {r.status.name}' for r in reqs]
    if note:
        lines += ['', f'Note from reviewer: {note}']
    lines += ['', f'View the group: {frontend_url(f"groups/{first.group_no}")}']
    send_email(subject, [first.user.user_email], '\n'.join(lines))


@api_bp.post('/groups')
@requester_required
def create_group():
    data = payload()
    shared = {f: data.get(f) for f in SHARED_FIELDS}
    shared.update(company=data.get('company'), id_card=data.get('id_card'), country=data.get('country'))
    reqs = _build_requests(shared, _parse_visitors(data.get('visitors')))

    # Documents are stored once and shared by every visitor in the group.
    holder = UserRequest()
    _save_uploads(holder)
    for r in reqs:
        r.documents = holder.documents

    today = datetime.now().strftime('%Y%m%d')
    for _ in range(5):
        group_no = f'GRP-{today}-{_next_seq(UserRequest.group_no, f"GRP-{today}-"):03d}'
        first = _next_seq(UserRequest.request_no, f'REQ-{today}-')
        now = datetime.utcnow()
        for i, r in enumerate(reqs):
            r.request_no = f'REQ-{today}-{first + i:03d}'
            r.group_no, r.status, r.submitted_at = group_no, ApprovalStatusEnum.PENDING, now
            db.session.add(r)
        try:
            db.session.commit()
            break
        except IntegrityError:
            # Numbers were taken by a concurrent submission; retry with fresh ones.
            db.session.rollback()
    else:
        _discard_uploads(holder)
        raise ApiError('Could not allocate request numbers. Please try again.', 503)

    _email_requester(reqs, f'Group access request {group_no} submitted',
                     f'Your group access request for {len(reqs)} visitors has been submitted for review.')
    return jsonify(group=_group_summary(reqs)), 201


@api_bp.get('/groups/<group_no>')
@login_required
def get_group(group_no):
    return jsonify(group=_group_summary(_group_or_404(group_no)))


@api_bp.post('/groups/<group_no>/status')
@controller_required
def review_group(group_no):
    reqs = _group_or_404(group_no)
    data = payload()
    if reqs[0].user_id == current_user.user_id:
        raise ApiError('You cannot review your own request. Ask another Access Controller.', 403)
    note = clean(data.get('note'))
    if data.get('status') in ('REJECTED', 'TERMINATED') and not note:
        raise ApiError('Please give a reason.', 422, {'note': 'A reason is required.'})

    ids = data.get('ids')
    selected = [r for r in reqs if ids is None or r.request_id in {int(i) for i in ids}]
    updated, skipped = [], []
    for r in selected:
        try:
            apply_review(r, data.get('status'), note)
            updated.append(r)
        except ApiError as e:
            skipped.append({'id': r.request_id, 'request_no': r.request_no, 'reason': e.message})
    if not updated:
        db.session.rollback()
        raise ApiError(skipped[0]['reason'] if skipped else 'No visitors selected.', 409)
    db.session.commit()

    verb = {'PENDING': 'reopened'}.get(updated[0].status.name, updated[0].status.name.lower())
    _email_requester(updated, f'Group access request {group_no}: {len(updated)} {verb}',
                     f'{len(updated)} visitor(s) in your group access request have been {verb}.', note)
    return jsonify(group=_group_summary(reqs), updated=len(updated), skipped=skipped)
