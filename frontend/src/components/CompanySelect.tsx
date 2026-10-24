import { useEffect, useState } from 'react';
import { COMPANIES } from '../companies';

const OTHER = '__other__';

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Offer "Others" with a free-text box (request forms). Registration leaves this off. */
  allowOther?: boolean;
  /** A value outside the list to keep offering, e.g. a user's company from before the list existed. */
  keepValue?: string;
  placeholder?: string;
}

/** Company dropdown from the fixed list, optionally with "Others" and a box to type the name. */
export function CompanySelect({ id, value, onChange, allowOther = false, keepValue, placeholder = 'Select company' }: Props) {
  const inList = COMPANIES.includes(value) || (!!keepValue && value === keepValue);
  // "Others" stays selected while the typed name is empty, so the box doesn't vanish mid-edit.
  const [other, setOther] = useState(allowOther && !!value && !inList);
  useEffect(() => {
    if (allowOther && value && !inList) setOther(true);
  }, [allowOther, value, inList]);

  const selectValue = other ? OTHER : inList ? value : '';
  return (
    <>
      <select id={id} className="select" value={selectValue}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setOther(true);
            onChange('');
          } else {
            setOther(false);
            onChange(e.target.value);
          }
        }}>
        <option value="" disabled>{placeholder}</option>
        {COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
        {keepValue && !COMPANIES.includes(keepValue) && <option value={keepValue}>{keepValue}</option>}
        {allowOther && <option value={OTHER}>Others</option>}
      </select>
      {other && (
        <input className="input" style={{ marginTop: 6 }} autoFocus={!value} placeholder="Type the company name"
          aria-label="Company name" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </>
  );
}
