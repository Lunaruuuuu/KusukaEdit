import EditorRoot from "@/components/EditorRoot";
import AuthGate from "@/components/AuthGate";

// This page itself can stay a Server Component: AuthGate and EditorRoot are
// "use client" components. AuthGate sends a visitor without a session to
// /login; EditorRoot lazy-loads the Konva canvas with ssr:false.
export default function Home() {
  return (
    <AuthGate>
      <EditorRoot />
    </AuthGate>
  );
}
