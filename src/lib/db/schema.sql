CREATE TABLE IF NOT EXISTS companies (
  cik TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ticker TEXT
);
CREATE INDEX IF NOT EXISTS idx_companies_ticker ON companies (ticker);

CREATE TABLE IF NOT EXISTS insiders (
  cik TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS filings (
  accession_number TEXT PRIMARY KEY,
  company_cik TEXT NOT NULL REFERENCES companies (cik),
  filed_date DATE NOT NULL,
  period_of_report DATE
);
CREATE INDEX IF NOT EXISTS idx_filings_company_date ON filings (company_cik, filed_date);

CREATE TABLE IF NOT EXISTS filing_owners (
  accession_number TEXT NOT NULL REFERENCES filings (accession_number) ON DELETE CASCADE,
  insider_cik TEXT NOT NULL REFERENCES insiders (cik),
  is_director BOOLEAN NOT NULL DEFAULT FALSE,
  is_officer BOOLEAN NOT NULL DEFAULT FALSE,
  is_ten_percent_owner BOOLEAN NOT NULL DEFAULT FALSE,
  officer_title TEXT,
  PRIMARY KEY (accession_number, insider_cik)
);
CREATE INDEX IF NOT EXISTS idx_filing_owners_insider ON filing_owners (insider_cik);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  accession_number TEXT NOT NULL REFERENCES filings (accession_number) ON DELETE CASCADE,
  security_title TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  code TEXT NOT NULL,
  shares NUMERIC,
  price_per_share NUMERIC,
  acquired_disposed CHAR(1) NOT NULL,
  shares_owned_after NUMERIC,
  is_derivative BOOLEAN NOT NULL,
  direct_ownership BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_transactions_filing ON transactions (accession_number);
CREATE INDEX IF NOT EXISTS idx_transactions_date_code ON transactions (transaction_date, code);
