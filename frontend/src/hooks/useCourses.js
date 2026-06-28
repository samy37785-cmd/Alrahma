import { useEffect, useState } from 'react';
import { getCourses } from '../api/client';

/**
 * Example of fetching data from the API inside useEffect.
 * Returns { courses, loading, error }.
 *
 * Usage in a component:
 *   const { courses, loading, error } = useCourses();
 */
export default function useCourses() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true; // guard against setting state after unmount

    (async () => {
      try {
        const data = await getCourses();
        if (active) setCourses(data);
      } catch (err) {
        if (active) setError(err.response?.data?.message || err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []); // empty deps = run once on mount

  return { courses, loading, error };
}
