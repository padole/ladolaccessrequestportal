// Keep in sync with REGISTRATION_COMPANIES in myapp/api/utils.py
export const COMPANIES = ['Ladol', 'SHI-MCI', 'Total', 'Shell', 'Exxon'];

/** A <datalist> id for company suggestions on inputs that still accept any name. */
export const COMPANY_LIST_ID = 'company-options';

/** True for SHI-MCI, ignoring case, spaces and hyphens (mirrors is_shi_mci in myapp/api/requests.py). */
export const isShiMci = (company: string | null | undefined) =>
  (company ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'shimci';

/** Only SHI-MCI visitors need an ID card and job title. */
export const needsIdCard = isShiMci;
