import { Pool } from "@neondatabase/serverless";

type DatabaseRow = Record<string, unknown>;

type QueryResult = {
  rows: DatabaseRow[];
  rowCount: number | null;
};

type QueryRunner = {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
};

type GlobalWithComedyPool = typeof globalThis & {
  __comedyClubPool?: Pool;
};

function connectionString() {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error(
      "DATABASE_URL is missing. Add the Xata PostgreSQL connection string to the server environment.",
    );
  }
  return value;
}

function getPool() {
  const globalScope = globalThis as GlobalWithComedyPool;
  if (!globalScope.__comedyClubPool) {
    globalScope.__comedyClubPool = new Pool({
      connectionString: connectionString(),
      max: 4,
      idleTimeoutMillis: 15_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalScope.__comedyClubPool;
}

function postgresPlaceholders(statement: string) {
  let position = 0;
  return statement.replace(/\?/g, () => `$${++position}`);
}

export class PostgresStatement {
  private values: unknown[] = [];

  constructor(
    private readonly database: PostgresDatabase,
    private readonly statement: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async execute(runner: QueryRunner = this.database.runner()) {
    return runner.query(postgresPlaceholders(this.statement), this.values);
  }

  async first() {
    const result = await this.execute();
    return result.rows[0] ?? null;
  }

  async all() {
    const result = await this.execute();
    return { results: result.rows };
  }

  async run() {
    const result = await this.execute();
    return {
      meta: { changes: result.rowCount ?? 0 },
      results: result.rows,
    };
  }
}

export class PostgresDatabase {
  private readonly pool = getPool();

  runner(): QueryRunner {
    return this.pool as unknown as QueryRunner;
  }

  prepare(statement: string) {
    return new PostgresStatement(this, statement);
  }

  async batch(statements: PostgresStatement[]) {
    const client = await this.pool.connect();
    const runner = client as unknown as QueryRunner;
    try {
      await client.query("BEGIN");
      const results = [];
      for (const statement of statements) {
        results.push(await statement.execute(runner));
      }
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

let database: PostgresDatabase | null = null;

export function getPostgresDatabase() {
  database ??= new PostgresDatabase();
  return database;
}
