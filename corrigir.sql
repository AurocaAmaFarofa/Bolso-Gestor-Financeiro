SET NAMES utf8mb4;

UPDATE categorias_gasto
SET nome = 'alimentação'
WHERE id IN (1, 2);

UPDATE categorias_gasto
SET nome = 'saúde'
WHERE id IN (9, 10);

UPDATE categorias_gasto
SET nome = 'salário'
WHERE id = 16;