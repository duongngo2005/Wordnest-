export type MySqlConnection = {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
};

export function parseMySqlConnection(value: string): MySqlConnection {
  const sourceUrl = new URL(value);
  if (sourceUrl.protocol !== "mysql:") {
    throw new Error("MYSQL_DATABASE_URL must use the mysql:// protocol.");
  }
  if (!sourceUrl.hostname || !sourceUrl.pathname || sourceUrl.pathname === "/") {
    throw new Error("MYSQL_DATABASE_URL must include host and database name.");
  }
  if (!sourceUrl.username) {
    throw new Error("MYSQL_DATABASE_URL must include a MySQL username.");
  }

  return {
    host: sourceUrl.hostname,
    port: sourceUrl.port || "3306",
    user: decodeURIComponent(sourceUrl.username),
    password: decodeURIComponent(sourceUrl.password),
    database: decodeURIComponent(sourceUrl.pathname.slice(1)),
  };
}

export function buildMySqlDumpArguments(connection: MySqlConnection): string[] {
  return [
    "--protocol=TCP",
    `--host=${connection.host}`,
    `--port=${connection.port}`,
    `--user=${connection.user}`,
    "--single-transaction",
    "--routines",
    "--events",
    "--triggers",
    "--hex-blob",
    "--no-tablespaces",
    "--default-character-set=utf8mb4",
    "--set-gtid-purged=OFF",
    "--databases",
    connection.database,
  ];
}
