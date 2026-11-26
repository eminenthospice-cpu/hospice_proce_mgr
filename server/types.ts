export interface D1Result<T=Record<string,unknown>> { results:T[]; success:boolean; meta:{changes:number}; }
export interface Statement { bind(...values:unknown[]):Statement; first<T=Record<string,unknown>>(column?:string):Promise<T|null>; all<T=Record<string,unknown>>():Promise<D1Result<T>>; run():Promise<D1Result>; }
export interface Database { prepare(sql:string):Statement; batch(statements:Statement[]):Promise<D1Result[]>; }
export type Env = { DB:Database; DATA_ENCRYPTION_KEY:string; OWNER_EMAIL:string; SITE_ORIGIN:string; CF_ACCESS_TEAM_DOMAIN:string; CF_ACCESS_AUD:string; PHI_PROCESSING_APPROVED?:string; APP_MFA_REQUIRED?:string };
export class ApiError extends Error { status:number;code:string;constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;} }
export function assert(condition:unknown,status:number,code:string,message:string):asserts condition { if(!condition)throw new ApiError(status,code,message); }
