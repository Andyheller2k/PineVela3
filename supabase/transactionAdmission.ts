import type {PoolClient} from 'pg';

export type AdmissionOptions={
  residenceFreezeChange?:boolean;
  accountPolicyChange?:boolean;
  maintenanceChange?:boolean;
  administrator?:'read'|'write';
};

/** Server-selected locks, acquired in the existing global order in one network
 * round trip. Separate SQL statements preserve acquisition order; no transaction
 * authority or SQL text comes from a browser flag or request body. */
export async function takeTransactionAdmission(client:PoolClient,options:AdmissionOptions={}) {
  await client.query(transactionAdmissionSql(options));
}
export function transactionAdmissionSql(options:AdmissionOptions={}) {
  const statements=[
    options.residenceFreezeChange
      ? "select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0))"
      : "select pg_advisory_xact_lock_shared(hashtextextended('residence-deletion-freeze',0))",
    options.accountPolicyChange
      ? "select pg_advisory_xact_lock(hashtextextended('account-policies',0))"
      : "select pg_advisory_xact_lock_shared(hashtextextended('account-policies',0))",
    options.maintenanceChange
      ? "select pg_advisory_xact_lock(hashtextextended('platform-maintenance',0))"
      : "select pg_advisory_xact_lock_shared(hashtextextended('platform-maintenance',0))",
  ];
  if(options.administrator)statements.push(options.administrator==='read'
    ? "select pg_advisory_xact_lock_shared(hashtextextended('platform-settings',0))"
    : "select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
  return statements.join(';');
}
