import LoginClient from './LoginClient';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return <LoginClient nextPath={next ?? '/dashboard'} errorMessage={error ?? ''} />;
}
