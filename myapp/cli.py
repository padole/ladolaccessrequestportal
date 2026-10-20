import getpass

import click
from sqlalchemy import inspect, text

from myapp.models import ApprovalStatusEnum, IDCardEnum, Role, User, db, expire_overdue_requests

# Columns added since the original schema: (table, column, DDL type)
_NEW_COLUMNS = [
    ('user', 'role', "VARCHAR(20) NOT NULL DEFAULT 'user'"),
    ('user', 'created_at', 'DATETIME NULL'),
    ('user', 'last_login_at', 'DATETIME NULL'),
    ('user', 'user_job_title', "VARCHAR(200) NOT NULL DEFAULT ''"),
    ('user', 'user_company', "VARCHAR(200) NOT NULL DEFAULT ''"),
    ('user_request', 'updated_at', 'DATETIME NULL'),
    ('user_request', 'submitted_at', 'DATETIME NULL'),
    ('user_request', 'review_note', 'TEXT NULL'),
    ('user_request', 'reviewed_at', 'DATETIME NULL'),
    ('user_request', 'reviewed_by_id', 'INTEGER NULL'),
    ('user_request', 'host', "VARCHAR(200) NOT NULL DEFAULT ''"),
    ('user_request', 'expired_at', 'DATETIME NULL'),
    ('user_request', 'group_no', 'VARCHAR(20) NULL'),
    ('user_request', 'country', "VARCHAR(100) NOT NULL DEFAULT ''"),
]


def _quote(name):
    return db.engine.dialect.identifier_preparer.quote(name)


def upgrade_legacy_schema():
    """Bring a database created by the old Jinja app up to the current models.

    Idempotent: only adds what is missing. New databases are fully created by
    create_all() and need nothing here.
    """
    inspector = inspect(db.engine)
    changes = []
    with db.engine.begin() as conn:
        for table, column, ddl in _NEW_COLUMNS:
            existing = {c['name'] for c in inspector.get_columns(table)}
            if column not in existing:
                conn.execute(text(f'ALTER TABLE {_quote(table)} ADD COLUMN {_quote(column)} {ddl}'))
                changes.append(f'added {table}.{column}')

        if 'ix_user_request_group_no' not in {i['name'] for i in inspector.get_indexes('user_request')}:
            conn.execute(text('CREATE INDEX ix_user_request_group_no ON user_request (group_no)'))
            changes.append('indexed user_request.group_no')

        request_cols = {c['name']: c for c in inspector.get_columns('user_request')}
        if 'document' not in request_cols and 'documents' in request_cols:
            # An intermediate version of the app used a "documents" column.
            if db.engine.dialect.name == 'mysql':
                conn.execute(text('ALTER TABLE user_request CHANGE documents document TEXT NULL'))
            else:
                conn.execute(text('ALTER TABLE user_request RENAME COLUMN documents TO document'))
            changes.append('renamed user_request.documents -> document')
        elif 'document' not in request_cols:
            conn.execute(text('ALTER TABLE user_request ADD COLUMN document TEXT NULL'))
            changes.append('added user_request.document')

        if db.engine.dialect.name == 'mysql':
            # Old schema: request_no NOT NULL, document VARCHAR(255), status enum without DRAFT/EXPIRED.
            cols = {c['name']: c for c in inspect(db.engine).get_columns('user_request')}
            if not cols['request_no']['nullable']:
                conn.execute(text('ALTER TABLE user_request MODIFY request_no VARCHAR(20) NULL'))
                changes.append('made user_request.request_no nullable')
            if 'TEXT' not in str(cols['document']['type']).upper():
                conn.execute(text('ALTER TABLE user_request MODIFY document TEXT NULL'))
                changes.append('widened user_request.document to TEXT')
            id_wanted = [c.name for c in IDCardEnum]
            id_existing = getattr(cols['id_card']['type'], 'enums', None) or []
            if any(c not in id_existing for c in id_wanted):
                values = ','.join(f"'{c}'" for c in id_wanted)
                conn.execute(text(f'ALTER TABLE user_request MODIFY id_card ENUM({values}) NULL'))
                changes.append('added the new visitor ID card types to user_request.id_card')
            wanted = [s.name for s in ApprovalStatusEnum]
            existing = getattr(cols['status']['type'], 'enums', None) or []
            missing = [s for s in wanted if s not in existing]
            if missing:
                values = ','.join(f"'{s}'" for s in wanted)
                conn.execute(text(f'ALTER TABLE user_request MODIFY status ENUM({values}) NULL'))
                changes.append(f"added {', '.join(missing)} to user_request.status")

        conn.execute(text(f"UPDATE {_quote('user')} SET role = 'user' WHERE role IS NULL OR role = ''"))
        # The "admin" role was renamed to Access Controller.
        renamed = conn.execute(text(
            f"UPDATE {_quote('user')} SET role = 'access_controller' WHERE role = 'admin'"
        )).rowcount
        if renamed:
            changes.append(f'renamed role admin -> access_controller for {renamed} user(s)')

        # MySQL stored '' when the old app saved DRAFT before the enum allowed it.
        # Those rows carry placeholder numbers like DRAFT-0018; drafts now have none.
        fixed = conn.execute(text(
            "UPDATE user_request SET status = 'DRAFT', request_no = NULL "
            "WHERE (status IS NULL OR status = '') AND request_no LIKE 'DRAFT-%'"
        )).rowcount
        fixed += conn.execute(text(
            "UPDATE user_request SET status = 'PENDING' WHERE status IS NULL OR status = ''"
        )).rowcount
        if fixed:
            changes.append(f'repaired {fixed} request(s) with a blank status')

    changes.extend(_migrate_legacy_admins(inspector))
    return changes


def _migrate_legacy_admins(inspector):
    """Turn rows of the old separate `admin` table into Access Controller users.

    Password hashes are copied as-is, so legacy admins sign in on the normal
    login page with the password they already had.
    """
    if 'admin' not in inspector.get_table_names():
        return []
    # One-time migration: once any controller exists, roles are managed in the app,
    # and re-running this must not undo a demotion.
    if User.query.filter_by(role=Role.ACCESS_CONTROLLER.value).first():
        return []
    changes = []
    rows = db.session.execute(text('SELECT admin_username, admin_password FROM admin')).fetchall()
    for username, pwd_hash in rows:
        email = (username or '').strip().lower()
        if not email:
            continue
        user = User.query.filter(db.func.lower(User.user_email) == email).first()
        if user:
            if not user.is_controller:
                user.role = Role.ACCESS_CONTROLLER.value
                changes.append(f'promoted existing user {email} to Access Controller')
            continue
        db.session.add(User(user_fname='Admin', user_lname='', user_phone='-', user_email=email,
                            user_pwd=pwd_hash, role=Role.ACCESS_CONTROLLER.value))
        changes.append(f'migrated legacy admin {email} to a user account with the Access Controller role')
    db.session.commit()
    return changes


def ensure_schema(app):
    """Create missing tables and upgrade old ones; runs at startup."""
    with app.app_context():
        try:
            db.create_all()
            for change in upgrade_legacy_schema():
                app.logger.warning('Database upgraded: %s', change)
            if expired := expire_overdue_requests():
                app.logger.warning('Marked %d request(s) as expired', expired)
        except Exception:  # noqa: BLE001 - keep the app (and CLI) usable; errors surface per request
            app.logger.exception('Could not prepare the database at %s', app.config['SQLALCHEMY_DATABASE_URI'])


def register(app):
    @app.cli.command('init-db')
    def init_db():
        """Create tables and upgrade a legacy database in place."""
        db.create_all()
        for change in upgrade_legacy_schema():
            click.echo(f'  - {change}')
        click.echo('Database is ready.')
        if not User.query.filter_by(role=Role.ACCESS_CONTROLLER.value).first():
            click.echo('No Access Controller exists yet. Create one with: flask --app app create-controller <email>')

    @app.cli.command('create-controller')
    @click.argument('email')
    def create_controller(email):
        """Promote an existing user to Access Controller, or create a new one."""
        email = email.strip().lower()
        user = User.query.filter(db.func.lower(User.user_email) == email).first()
        if user:
            user.role = Role.ACCESS_CONTROLLER.value
            user.is_active = True
            db.session.commit()
            click.echo(f'{email} is now an Access Controller.')
            return
        first = click.prompt('First name')
        last = click.prompt('Last name')
        phone = click.prompt('Phone')
        password = getpass.getpass('Password (min 8 chars): ')
        if len(password) < 8:
            raise click.ClickException('Password must be at least 8 characters.')
        user = User(user_fname=first, user_lname=last, user_phone=phone, user_email=email, role=Role.ACCESS_CONTROLLER.value)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        click.echo(f'Access Controller {email} created.')

    @app.cli.command('set-role')
    @click.argument('email')
    @click.argument('role', type=click.Choice([r.value for r in Role]))
    def set_role(email, role):
        """Set a user's role from the command line."""
        user = User.query.filter(db.func.lower(User.user_email) == email.strip().lower()).first()
        if not user:
            raise click.ClickException(f'No user with email {email}.')
        user.role = role
        db.session.commit()
        click.echo(f'{user.user_email} role set to {role}.')
