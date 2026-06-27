import { useEffect, useState } from "react";

/**
 * Renderiza solo las primeras N filas de una lista, con "Ver más" para revelar más.
 * NO cambia los datos (los totales se siguen calculando sobre `items` completo): solo
 * limita cuántas filas se pintan en el DOM, para que listas grandes (p.ej. un cliente
 * con 40 expedientes) carguen rápido y no se renderice todo de golpe.
 *
 * Al cambiar la lista (nuevo filtro/datos) se reinicia a la primera página.
 */
export function usePaginacionRender<T>(items: T[], pageSize = 12) {
  const [visibles, setVisibles] = useState(pageSize);

  useEffect(() => {
    setVisibles(pageSize);
  }, [items, pageSize]);

  const mostrados = items.slice(0, visibles);
  const restantes = Math.max(0, items.length - visibles);
  const verMas = () => setVisibles((v) => v + pageSize);

  return { mostrados, restantes, hayMas: restantes > 0, verMas, pageSize };
}
