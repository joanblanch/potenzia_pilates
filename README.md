# Núcleo Pilates · Reservas

Demo de una app web de reservas para un estudio de pilates con 2 salas, 4 instructoras y 46 clases semanales de 8 plazas.

## Arrancar

Necesita Node 22 o superior. No tiene dependencias.

```bash
npm start      # http://localhost:3210
npm test       # pruebas de las reglas de reserva
```

La primera vez se generan los datos de prueba en `data/db.json`: 12 socias y las 46 clases de la semana siguiente a hoy. El botón **Reiniciar datos** los vuelve a generar.

## Cómo se usa

- **Entrar como:** eliges una socia o la dueña, sin contraseña (es una demo).
- **Socias:** ven el calendario semanal y las clases que les quedan en el bono. Desde ahí reservan, cancelan y se apuntan a la lista de espera o salen de ella.
- **Dueña:** ve la ocupación de cada clase con los nombres y la lista de espera, y qué socias tienen 1 o 0 clases en el bono.
- **Hora de la demo:** hace que la app funcione como si fuera otra fecha y hora, para probar la regla de las 12 horas. **Hora real** vuelve al reloj del ordenador.

## Reglas

Del encargo:

1. Cada socia tiene un bono de 8 clases al mes. Reservar descuenta una y, sin clases, no puede reservar.
2. Si cancela con 12 horas o más de antelación, la clase vuelve al bono; después, se pierde.
3. Si la clase está llena, la socia entra en la lista de espera. Cuando alguien cancela, la plaza pasa a la primera de la lista y ella lo ve en la app.

Decididas para la demo, porque el encargo no las fijaba:

- La lista de espera no descuenta nada hasta entrar en la plaza, pero para apuntarse hay que tener al menos 1 clase en el bono.
- Si a la primera de la lista ya no le quedan clases, o tiene otra clase a esa hora, sale de la lista con un aviso y la plaza pasa a la siguiente.
- Quien entra desde la lista con menos de 12 horas de margen puede cancelar y recuperar la clase.
- El bono cuenta por el mes de la clase, no por el de la reserva. Vuelve a 8 el día 1 y las clases que sobran no pasan al mes siguiente.
- Se puede reservar hasta la hora de inicio, y no se pueden reservar dos clases que coincidan en hora.
- La dueña solo consulta.

Fuera de alcance: pagos, app nativa y mensajes.

## Estructura

- `lib/rules.js`: reglas de reserva, cancelación, lista de espera y bono.
- `lib/seed.js`: datos de prueba.
- `server.js`: servidor HTTP con la API y los ficheros de `public/`.
- `public/`: la interfaz (HTML, CSS y JavaScript sin compilar).
- `test/rules.test.js`: una prueba por regla.
