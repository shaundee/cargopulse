import LoginClient from './LoginClient';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const nextPath = searchParams.next ?? '/dashboard';
  return <LoginClient nextPath={nextPath} />;
}
