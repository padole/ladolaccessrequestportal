import json
from datetime import date, datetime
from enum import Enum

from flask_login import UserMixin
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

db = SQLAlchemy()


class Role(str, Enum):
    # Reviews requests and manages users and roles.
    ACCESS_CONTROLLER = 'access_controller'
    # Gate staff: read-only view of every submitted request and its status.
    ACCESS_ADMIN = 'access_admin'
    USER = 'user'


ROLE_LABELS = {
    Role.ACCESS_CONTROLLER.value: 'Access Controller',
    Role.ACCESS_ADMIN.value: 'Access Admin',
    Role.USER.value: 'User',
}


class IDCardEnum(Enum):
    # Member names are what is stored in the database; keep them stable.
    vistor = 'Visitor ID'
    parmanent = 'Permanent ID'
    not_applicable = 'Not applicable'


class ApprovalStatusEnum(Enum):
    DRAFT = 'DRAFT'
    PENDING = 'PENDING'
    APPROVED = 'APPROVED'
    REJECTED = 'REJECTED'
    TERMINATED = 'TERMINATED'
    # Set automatically once the departure date has passed; final.
    EXPIRED = 'EXPIRED'


# Which status changes a reviewer may make from each status.
STATUS_TRANSITIONS = {
    ApprovalStatusEnum.PENDING: {ApprovalStatusEnum.APPROVED, ApprovalStatusEnum.REJECTED},
    ApprovalStatusEnum.APPROVED: {ApprovalStatusEnum.TERMINATED},
    ApprovalStatusEnum.REJECTED: {ApprovalStatusEnum.PENDING},
}


class User(UserMixin, db.Model):
    user_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_fname = db.Column(db.String(100), nullable=False)
    user_lname = db.Column(db.String(100), nullable=False)
    user_phone = db.Column(db.String(100), nullable=False)
    user_email = db.Column(db.String(100), nullable=False, unique=True)
    user_pwd = db.Column(db.String(200))
    role = db.Column(db.String(20), nullable=False, default=Role.USER.value, server_default=Role.USER.value)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login_at = db.Column(db.DateTime)

    def get_id(self):
        return str(self.user_id)

    @property
    def is_controller(self):
        return self.role == Role.ACCESS_CONTROLLER.value

    @property
    def is_access_admin(self):
        return self.role == Role.ACCESS_ADMIN.value

    @property
    def can_view_all_requests(self):
        return self.is_controller or self.is_access_admin

    @property
    def can_create_requests(self):
        return not self.is_access_admin

    @property
    def full_name(self):
        return f'{self.user_fname} {self.user_lname}'.strip()

    def set_password(self, password):
        self.user_pwd = generate_password_hash(password)

    def check_password(self, password):
        return bool(self.user_pwd) and check_password_hash(self.user_pwd, password)

    def to_dict(self):
        return {
            'id': self.user_id,
            'first_name': self.user_fname,
            'last_name': self.user_lname,
            'full_name': self.full_name,
            'email': self.user_email,
            'phone': self.user_phone,
            'role': self.role,
            'role_label': ROLE_LABELS.get(self.role, self.role),
            'is_active': self.is_active,
            'created_at': _iso(self.created_at),
            'last_login_at': _iso(self.last_login_at),
        }


class UserRequest(db.Model):
    request_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    submitted_at = db.Column(db.DateTime)
    # Drafts have no request number until they are submitted.
    request_no = db.Column(db.String(20), nullable=True, unique=True)
    # Requests raised together for a party of visitors share a group number (GRP-YYYYMMDD-NNN).
    group_no = db.Column(db.String(20), index=True)
    fullname = db.Column(db.String(200), nullable=False, default='')
    company = db.Column(db.String(200), nullable=False, default='')
    host = db.Column(db.String(200), nullable=False, default='', server_default='')
    # job_role and location are no longer collected; kept for existing requests.
    job_role = db.Column(db.String(200), nullable=False, default='')
    email_address = db.Column(db.String(100), nullable=False, default='')
    phone_number = db.Column(db.String(100), nullable=False, default='')
    id_card = db.Column(db.Enum(IDCardEnum), default=IDCardEnum.vistor)
    expected_date = db.Column(db.Date)
    departure_date = db.Column(db.Date)
    duration = db.Column(db.String(50), nullable=False, default='')
    location = db.Column(db.String(200), nullable=False, default='')
    purpose = db.Column(db.String(250), nullable=False, default='')
    status = db.Column(db.Enum(ApprovalStatusEnum), default=ApprovalStatusEnum.PENDING)
    user_id = db.Column(db.Integer, db.ForeignKey('user.user_id'), nullable=False)
    user = db.relationship('User', foreign_keys=[user_id], backref=db.backref('requests', cascade='all, delete-orphan'))
    # JSON list of stored file names
    document = db.Column(db.Text)
    review_note = db.Column(db.Text)
    reviewed_at = db.Column(db.DateTime)
    expired_at = db.Column(db.DateTime)
    reviewed_by_id = db.Column(db.Integer, db.ForeignKey('user.user_id', ondelete='SET NULL'))
    reviewed_by = db.relationship('User', foreign_keys=[reviewed_by_id])

    @property
    def documents(self):
        if not self.document:
            return []
        try:
            value = json.loads(self.document)
        except (ValueError, TypeError):
            # Legacy rows stored a single file name
            return [self.document]
        return value if isinstance(value, list) else []

    @documents.setter
    def documents(self, names):
        self.document = json.dumps(names) if names else None

    def to_dict(self, detail=False):
        data = {
            'id': self.request_id,
            'request_no': self.request_no,
            'group_no': self.group_no,
            'fullname': self.fullname,
            'company': self.company,
            'host': self.host,
            'job_role': self.job_role,
            'email': self.email_address,
            'phone': self.phone_number,
            'id_card': self.id_card.name if self.id_card else None,
            'id_card_label': self.id_card.value if self.id_card else None,
            'expected_date': _iso(self.expected_date),
            'departure_date': _iso(self.departure_date),
            'duration': self.duration,
            'location': self.location,
            'purpose': self.purpose,
            'status': self.status.name if self.status else None,
            'created_at': _iso(self.created_at),
            'updated_at': _iso(self.updated_at),
            'submitted_at': _iso(self.submitted_at),
            'created_by': {'id': self.user.user_id, 'full_name': self.user.full_name, 'email': self.user.user_email}
            if self.user else None,
            'document_count': len(self.documents),
        }
        if detail:
            data.update({
                'documents': [{'name': n, 'label': display_filename(n)} for n in self.documents],
                'review_note': self.review_note,
                'reviewed_at': _iso(self.reviewed_at),
                'expired_at': _iso(self.expired_at),
                'reviewed_by': {'id': self.reviewed_by.user_id, 'full_name': self.reviewed_by.full_name}
                if self.reviewed_by else None,
                'allowed_transitions': [s.name for s in STATUS_TRANSITIONS.get(self.status, ())],
            })
        return data


def display_filename(stored_name):
    """Stored names are '<32 hex chars>_<original>'; show the original."""
    prefix, sep, rest = stored_name.partition('_')
    return rest if sep and len(prefix) == 32 else stored_name


def _iso(value):
    return value.isoformat() if value else None


# Requests that are still "live" and so expire once the visit is over.
EXPIRABLE_STATUSES = (ApprovalStatusEnum.PENDING, ApprovalStatusEnum.APPROVED)


def expire_overdue_requests(today=None):
    """Mark live requests whose departure date has passed as EXPIRED.

    A visitor still needs access on their departure day, so a request expires
    the day after it. Returns the number of requests changed.
    """
    today = today or date.today()
    count = (UserRequest.query
             .filter(UserRequest.status.in_(EXPIRABLE_STATUSES), UserRequest.departure_date < today)
             .update({UserRequest.status: ApprovalStatusEnum.EXPIRED, UserRequest.expired_at: datetime.utcnow()},
                     synchronize_session=False))
    if count:
        db.session.commit()
    return count
