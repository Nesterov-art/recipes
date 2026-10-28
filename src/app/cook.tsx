import { Redirect, useLocalSearchParams } from 'expo-router';

// The cooking screen's address in the PWA before the redesign. An open tab or a saved
// address lands on /cooking with the same recipe; an unknown one is handled there.
export default function OldCookRoute() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <Redirect href={id ? { pathname: '/cooking', params: { id } } : '/cooking'} />;
}
