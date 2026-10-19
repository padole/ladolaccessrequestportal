import { useSearchParams } from 'react-router-dom';
import RequestForm from './RequestForm';
import GroupRequestForm from './GroupRequestForm';

export default function NewRequest() {
  const [params] = useSearchParams();
  return params.get('mode') === 'group' ? <GroupRequestForm /> : <RequestForm />;
}
