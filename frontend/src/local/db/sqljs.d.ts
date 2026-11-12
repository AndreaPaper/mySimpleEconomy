// La variante di sql.js con il motore WebAssembly incorporato nel file, invece che
// in un .wasm da scaricare a parte: si carica allo stesso modo nel browser, nei test
// (Node) e dentro l'app Android, senza dover servire il .wasm da nessuna parte.
declare module 'sql.js/dist/sql-wasm-inline.js' {
  import initSqlJs from 'sql.js'
  export default initSqlJs
}
