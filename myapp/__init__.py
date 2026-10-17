import os

from flask import Flask, jsonify, send_from_directory
from flask_login import LoginManager
from flask_mail import Mail
from flask_migrate import Migrate
from flask_wtf import CSRFProtect
from flask_wtf.csrf import CSRFError

mail = Mail()
csrf = CSRFProtect()
login_manager = LoginManager()
migrate = Migrate()


def create_app(config_object='myapp.config.Config'):
    from myapp.models import User, db

    app = Flask(__name__, instance_relative_config=True, static_folder=None)
    app.config.from_object(config_object)
    os.makedirs(app.instance_path, exist_ok=True)
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    mail.init_app(app)
    csrf.init_app(app)
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    @login_manager.user_loader
    def load_user(user_id):
        user = db.session.get(User, int(user_id))
        # Disabled accounts lose access immediately, even with a live session.
        return user if user and user.is_active else None

    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify(error='Authentication required'), 401

    @app.errorhandler(CSRFError)
    def csrf_error(e):
        return jsonify(error='Your session expired. Please refresh and try again.'), 400

    @app.errorhandler(413)
    def too_large(e):
        return jsonify(error='Upload is too large.'), 413

    from myapp.api import api_bp
    app.register_blueprint(api_bp, url_prefix='/api')

    @app.errorhandler(404)
    def not_found(e):
        return jsonify(error='Not found'), 404

    _register_spa(app)

    @app.errorhandler(500)
    def server_error(e):
        return jsonify(error='Something went wrong on the server. Please try again.'), 500

    from myapp import cli
    cli.register(app)
    if not app.config.get('SKIP_SCHEMA_CHECK'):
        cli.ensure_schema(app)

    return app


def _register_spa(app):
    """Serve the built React app; any non-API path falls back to index.html."""
    dist = app.config['FRONTEND_DIST']

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def spa(path):
        if path.startswith('api/'):
            return jsonify(error='Not found'), 404
        if path and os.path.isfile(os.path.join(dist, path)):
            return send_from_directory(dist, path)
        if os.path.isfile(os.path.join(dist, 'index.html')):
            return send_from_directory(dist, 'index.html')
        return (
            'Frontend not built. Run "npm run build" in ./frontend, '
            'or use the Vite dev server (npm run dev) during development.',
            503,
        )
