import { Redirect } from 'expo-router';

// Entry point: redirect to splash until auth state is wired up
export default function Index() {
  return <Redirect href="/(auth)/splash" />;
}
