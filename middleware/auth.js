const jwt = require('jsonwebtoken')

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization

  let token

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  } else {
    token = req.cookies.token
  }

  if (!token) {
    return res.status(401).json({ erro: 'Token não fornecido' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    if (!decoded.sub) {
      return res.status(401).json({ erro: 'Token inválido' })
    }

    req.usuarioId = decoded.sub
    next()
  } catch (error) {
    return res.status(401).json({ erro: 'Token inválido' })
  }
}

module.exports = authMiddleware
