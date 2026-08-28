-- Poder echar a un token que ya está firmado.
--
-- Hasta ahora no se podía: un token vale hasta que caduca, aunque se cierre la
-- sesión o se cambie la contraseña. Cerrar sesión sólo borraba la cookie del
-- navegador; quien tuviera una copia del token seguía dentro hasta una hora.
-- La vida corta era la tirita puesta a conciencia mientras esto no existiera.
--
-- Un contador y no una lista de tokens revocados. La lista crece sin fin y hay
-- que barrerla; el contador ocupa cuatro bytes por usuario y no crece nunca.
-- Lo que se pierde es la granularidad — no se puede echar a un dispositivo
-- concreto, se echa a todos a la vez — y para lo que hay ahora sobra: las dos
-- acciones que existen («cambiar la contraseña» y «salir en todos los sitios»)
-- quieren justamente eso. El día que haya una lista de dispositivos, esta
-- columna sigue siendo el suelo sobre el que se construye.
--
-- El precio está en el guardia: cada petición pasa a leer esta columna. Es una
-- búsqueda por clave primaria, y revocar exige estado — no hay forma de saber
-- que algo ha cambiado sin ir a mirarlo.

ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
