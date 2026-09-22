/* La version que sirve el Worker ahora mismo. Viaja en todas las respuestas
   porque una pestana abierta desde antes del ultimo despliegue sigue hablando
   con el servidor nuevo: entiende a medias lo que le responde, se traga los
   rechazos que no conoce y acaba ensenando una pantalla que ya no es cierta.
   Comparar dos cadenas es todo lo que hace falta para que se entere y se
   recargue. Debe coincidir con `APP_VERSION` de public/index.html y con la
   version de package.json; hay una prueba que lo vigila. */
export const APP_VERSION = "v4.5.0";
