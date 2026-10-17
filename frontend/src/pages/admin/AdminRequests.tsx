import { RequestsTable } from '../../components/RequestsTable';
import { useAuth } from '../../hooks/auth';

export default function AdminRequests() {
  const { isController } = useAuth();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isController ? 'Review requests' : 'All requests'}</h1>
          <p className="muted">
            {isController
              ? 'All submitted access requests across the organisation. Open one to approve, reject or terminate it.'
              : 'Every submitted access request and its status.'}
          </p>
        </div>
      </div>
      <RequestsTable scope="all" />
    </>
  );
}
