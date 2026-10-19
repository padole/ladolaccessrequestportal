import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { RequestsTable } from '../components/RequestsTable';

export default function MyRequests() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>My requests</h1>
          <p className="muted">Every access request you have submitted, and where it stands.</p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {/* <Link className="btn" to="/requests/new?mode=group"><Users size={16} /> New group request</Link> */}
          <Link className="btn btn-primary" to="/requests/new"><Plus size={16} /> New request</Link>
        </div>
      </div>
      <RequestsTable
        scope="mine"
        emptyAction={<Link className="btn btn-primary" to="/requests/new">Create your first request</Link>}
      />
    </>
  );
}
