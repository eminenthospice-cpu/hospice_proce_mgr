// Local test adapter only. Never imported by the deployed Worker.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {Database,Statement,D1Result} from './types.ts';
export class TestDatabase implements Database {
 readonly sqlite=new DatabaseSync(':memory:');
 constructor(){this.sqlite.exec('PRAGMA foreign_keys = ON');const dir=fileURLToPath(new URL('../drizzle/',import.meta.url));for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())this.sqlite.exec(readFileSync(dir+name,'utf8'));}
 prepare(sql:string):Statement {const db=this.sqlite;const create=(values:unknown[]):Statement=>({bind:(...v)=>create(v),async first<T>(column?:string){const row=db.prepare(sql).get(...values as never[]) as Record<string,unknown>|undefined;return (row?(column?row[column]:row):null) as T|null;},async all<T>(){return {results:db.prepare(sql).all(...values as never[]) as T[],success:true,meta:{changes:0}};},async run(){const r=db.prepare(sql).run(...values as never[]);return {results:[],success:true,meta:{changes:Number(r.changes)}};}});return create([]);}
 async batch(statements:Statement[]):Promise<D1Result[]>{this.sqlite.exec('BEGIN IMMEDIATE');try{const result=[];for(const statement of statements)result.push(await statement.run());this.sqlite.exec('COMMIT');return result;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}
 close(){this.sqlite.close();}
}
