import os

from dotenv import load_dotenv

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
load_dotenv(os.path.join(BASE_DIR, '.env'))


def _bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ('1', 'true', 'yes', 'on')


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-only-change-me')
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'DATABASE_URL', 'sqlite:///' + os.path.join(BASE_DIR, 'instance', 'accessportal.db')
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {'pool_pre_ping': True}

    # Session cookie hardening
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_SECURE = _bool('SESSION_COOKIE_SECURE', False)
    REMEMBER_COOKIE_HTTPONLY = True

    # CSRF: the React client sends the token in the X-CSRFToken header
    WTF_CSRF_TIME_LIMIT = None

    # Uploads
    UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', os.path.join(BASE_DIR, 'uploads'))
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024
    MAX_FILES_PER_REQUEST = 5
    MAX_TOTAL_UPLOAD_BYTES = 10 * 1024 * 1024
    ALLOWED_EXTENSIONS = {'pdf', 'jpg', 'jpeg', 'png', 'docx'}

    # Mail (credentials come from the environment, never from source control)
    MAIL_SERVER = os.environ.get('MAIL_SERVER', '')
    MAIL_PORT = int(os.environ.get('MAIL_PORT', 587))
    MAIL_USE_TLS = _bool('MAIL_USE_TLS', True)
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER = (
        os.environ.get('MAIL_SENDER_NAME', 'Ladol Access'),
        os.environ.get('MAIL_SENDER_EMAIL', os.environ.get('MAIL_USERNAME', 'no-reply@localhost')),
    )
    MAIL_SUPPRESS_SEND = _bool('MAIL_SUPPRESS_SEND', not MAIL_SERVER)

    # Public URL of the React app, used to build links in emails
    FRONTEND_URL = os.environ.get('FRONTEND_URL', '')

    # Built React app served by Flask in production
    FRONTEND_DIST = os.path.join(BASE_DIR, 'frontend', 'dist')
