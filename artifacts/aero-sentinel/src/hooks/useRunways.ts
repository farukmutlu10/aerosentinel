import { useQuery } from "@tanstack/react-query";

export interface Runway {
  designator: string;
  leIdent: string;
  heIdent: string;
  leHeadingDegT: number | null;
  heHeadingDegT: number | null;
  lengthFt: number | null;
  surface: string | null;
}

/**
 * Static OurAirports-derived runway data — rarely changes, so it's cached
 * indefinitely per ICAO instead of refetching like live TAF/METAR data.
 */
export function useRunways(icao: string) {
  return useQuery<Runway[]>({
    queryKey: ["runways", icao],
    queryFn: () =>
      fetch(`/api/airports/${icao}/runways`)
        .then((r) => r.json())
        .then((data) => data.runways as Runway[]),
    enabled: !!icao,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
