const mysql = require('mysql2')

const conexao = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'B0lsoB4nCo',
  database: 'bolso',
})

conexao.connect((erro) => {
  if (erro) {
    console.error('Erro ao conectar:', erro)
    return
  }

  console.log('Conectado ao banco bolso!')

  const sql = `
    SELECT * FROM lancamentos
  `

  conexao.query(sql, (erro, resultados) => {
    if (erro) {
      console.error('Erro ao buscar lançamentos:', erro)
      return
    }

    console.log(resultados)

    conexao.end()
  })
})
