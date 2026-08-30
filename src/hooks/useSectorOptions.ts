import { useEffect, useState } from 'react';
import { SECTORS } from '../constants';
import { getActiveRetreatEvent } from '../services/eventSettings';
import { listEventServicesSnapshot } from '../services/eventServices';

export function useSectorOptions() {
  const [sectorOptions, setSectorOptions] = useState<string[]>([...SECTORS]);

  useEffect(() => {
    let active = true;
    getActiveRetreatEvent()
      .then(async (edition) => {
        if (!edition) return [];
        const snapshot = await listEventServicesSnapshot(edition.id);
        return snapshot.units
          .filter((unit) => unit.unit_type === 'sector' && unit.is_active)
          .map((unit) => unit.name);
      })
      .then((names) => {
        if (!active || !names.length) return;
        setSectorOptions(Array.from(new Set([...SECTORS, ...names])));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  return sectorOptions;
}
