# Features added in 2.3.0

## Databases
Besides MySQL and PostgreSQL the connection form now offers **MariaDB**, **Microsoft SQL Server** and **SQLite**.
SQLite has no server: enter the path of the `.sqlite`/`.db` file as the host (it is created when missing).

## Running queries
* A script with several `;` separated statements runs **strictly in order** and shows **one result tab per statement**.
* The batch stops at the first failing statement (the error is shown in its own tab). Run **SQL: Stop Running Queries** to
  stop a long batch before its next statement starts. A statement already sent to the server cannot be cancelled.
* **SQL: Show query history** (`Ctrl+Alt+H`) lists the last 200 distinct statements. Pick one to run it, open it in an editor, or clear the history.
* `USE database` and DDL statements keep the status bar, the table tree and autocompletion in sync.

## Results grid
* **Filter** box searches every column. Click a column header to sort (click again to reverse).
* **Right-click a cell** to copy the cell, the row, the column, or all visible rows as CSV / JSON / Markdown.
* **Inline editing**: for a simple single-table `SELECT ... FROM table` the grid is editable. Double-click a cell, change it and press Enter.
  The edit runs as a parameterised `UPDATE` that identifies the row by its primary key. Without a primary key every column of the
  original row is matched, so identical duplicate rows would all change. If no row matches the edit is reported as failed.

## Safety
* **Read-only connections**: tick *Open as read-only* when connecting, or run **SQL: Toggle Read-Only Mode**. A batch that
  contains any statement that is not recognisably read-only (INSERT, UPDATE, DELETE, DDL, `SELECT ... INTO`, `SET GLOBAL`,
  unknown statements...) is refused as a whole before anything runs, and inline editing is disabled.
  This is a guard inside the extension, **not** a security boundary: a `SELECT` that calls a function with side effects
  is not detected. Use a database user without write privileges when you need a hard guarantee.
* **Test connection** button on the connect form, and **SQL: Test current connection** (five round trips with timings).

## Editing
* **SQL: Format query** (also *Format Document* / *Format Selection*). Settings: `database.format.indent`, `database.format.uppercaseKeywords`.
* Autocompletion is context aware: table names after `FROM`/`JOIN`/`INTO`/`UPDATE`, column names after `table.`, otherwise keywords, tables and columns.

## Build notes
The build now uses webpack 5, TypeScript 4.9 and Jest 29 (Node 18+). `sql.js` is not bundled: `resources/sql-wasm.js` and
`resources/sql-wasm.wasm` are copied from `node_modules/sql.js/dist` and loaded at runtime. Refresh them when upgrading `sql.js`.
