"""WSGI entry point for production servers (PythonAnywhere, gunicorn, waitress).

    gunicorn wsgi:application
"""
from myapp import create_app

application = create_app()

# The default key is in the public repository; sessions signed with it could be forged.
if application.config['SECRET_KEY'] == 'dev-only-change-me':
    raise RuntimeError('Set SECRET_KEY in .env before running in production.')
