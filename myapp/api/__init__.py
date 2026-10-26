import time

from flask import Blueprint, current_app
from sqlalchemy.exc import SQLAlchemyError
from werkzeug.exceptions import HTTPException

from myapp.api.utils import ApiError, error
from myapp.models import db, expire_overdue_requests

api_bp = Blueprint('api', __name__)


@api_bp.errorhandler(ApiError)
def handle_api_error(e):
    return error(e.message, e.status, e.fields)


@api_bp.errorhandler(Exception)
def handle_unexpected(e):
    if isinstance(e, HTTPException):
        return error(e.description or e.name, e.code)
    db.session.rollback()
    current_app.logger.exception('Unhandled API error')
    message = 'Something went wrong on the server. Please try again.'
    if isinstance(e, SQLAlchemyError):
        message = 'The database is unavailable or not set up. Please contact an administrator.'
    return error(message, 500)


_EXPIRY_INTERVAL = 60  # seconds
_last_expiry_run = 0.0


@api_bp.before_request
def expire_overdue():
    # Statuses must be current before anything reads them; a cheap UPDATE
    # at most once a minute keeps that true without a separate scheduler.
    global _last_expiry_run
    now = time.monotonic()
    if now - _last_expiry_run >= _EXPIRY_INTERVAL:
        _last_expiry_run = now
        expire_overdue_requests()


@api_bp.after_request
def no_store(response):
    # API responses carry personal data; keep them out of browser caches.
    response.headers['Cache-Control'] = 'no-store'
    return response


from myapp.api import admin, auth, groups, microsoft, requests  # noqa: E402,F401
