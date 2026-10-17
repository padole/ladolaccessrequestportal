import os

from flask import current_app, jsonify, request
from flask_login import current_user

from myapp.api import api_bp
from myapp.api.utils import controller_required, clean, error, paginate, payload
from myapp.models import ApprovalStatusEnum, Role, User, UserRequest, db


def _get_user(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return None, error('User not found.', 404)
    return user, None


def _other_active_controllers(user):
    return User.query.filter(User.role == Role.ACCESS_CONTROLLER.value, User.is_active.is_(True),
                             User.user_id != user.user_id).count()


def _user_with_counts(user):
    data = user.to_dict()
    counts = dict(db.session.query(UserRequest.status, db.func.count(UserRequest.request_id))
                  .filter(UserRequest.user_id == user.user_id, UserRequest.status != ApprovalStatusEnum.DRAFT)
                  .group_by(UserRequest.status).all())
    data['request_counts'] = {s.name: counts.get(s, 0) for s in ApprovalStatusEnum if s != ApprovalStatusEnum.DRAFT}
    return data


@api_bp.get('/admin/users')
@controller_required
def list_users():
    q = User.query
    search = clean(request.args.get('search'))
    if search:
        like = f'%{search}%'
        q = q.filter(db.or_(User.user_fname.ilike(like), User.user_lname.ilike(like),
                            User.user_email.ilike(like), User.user_phone.ilike(like)))
    role = request.args.get('role')
    if role in {r.value for r in Role}:
        q = q.filter(User.role == role)
    status = request.args.get('status')
    if status in ('active', 'disabled'):
        q = q.filter(User.is_active.is_(status == 'active'))
    page, meta = paginate(q.order_by(User.user_fname, User.user_lname), default_per_page=15)
    return jsonify(items=[u.to_dict() for u in page.items], **meta)


@api_bp.get('/admin/users/<int:user_id>')
@controller_required
def get_user(user_id):
    user, err = _get_user(user_id)
    return err or jsonify(user=_user_with_counts(user))


@api_bp.patch('/admin/users/<int:user_id>')
@controller_required
def update_user(user_id):
    user, err = _get_user(user_id)
    if err:
        return err
    data = payload()
    is_self = user.user_id == current_user.user_id

    if 'role' in data:
        role = data.get('role')
        if role not in {r.value for r in Role}:
            return error('Unknown role.', 422)
        if role != user.role:
            if is_self:
                return error('You cannot change your own role.', 403)
            if user.is_controller and role != Role.ACCESS_CONTROLLER.value and not _other_active_controllers(user):
                return error('There must always be at least one active Access Controller.', 409)
            user.role = role

    if 'is_active' in data:
        active = bool(data.get('is_active'))
        if not active and is_self:
            return error('You cannot disable your own account.', 403)
        if not active and user.is_controller and not _other_active_controllers(user):
            return error('There must always be at least one active Access Controller.', 409)
        user.is_active = active

    db.session.commit()
    return jsonify(user=_user_with_counts(user))


@api_bp.delete('/admin/users/<int:user_id>')
@controller_required
def delete_user(user_id):
    user, err = _get_user(user_id)
    if err:
        return err
    if user.user_id == current_user.user_id:
        return error('You cannot delete your own account.', 403)
    if user.is_controller and not _other_active_controllers(user):
        return error('There must always be at least one active Access Controller.', 409)

    folder = current_app.config['UPLOAD_FOLDER']
    for req in user.requests:
        for name in req.documents:
            path = os.path.join(folder, name)
            if os.path.isfile(path):
                os.remove(path)
    # Keep review history on other users' requests, just without the reviewer link.
    UserRequest.query.filter(UserRequest.reviewed_by_id == user.user_id).update({'reviewed_by_id': None})
    db.session.delete(user)
    db.session.commit()
    return jsonify(ok=True)
