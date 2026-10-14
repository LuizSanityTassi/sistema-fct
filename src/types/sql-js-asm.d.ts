// Build "asm" do sql.js (SQLite em JavaScript puro, sem arquivo .wasm) — usada só no servidor para ler
// o banco do fluxo de caixa anterior enviado pela tela.
declare module "sql.js/dist/sql-asm.js" {
  export interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }
  export class Database {
    constructor(data?: Uint8Array);
    exec(sql: string): QueryExecResult[];
    close(): void;
  }
  export interface SqlJsStatic {
    Database: typeof Database;
  }
  export default function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>;
}
