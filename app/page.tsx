import EditorRoot from "@/components/EditorRoot";

// This page itself can stay a Server Component: EditorRoot is a "use client"
// component, and it internally lazy-loads the Konva canvas with ssr:false.
export default function Home() {
  return <EditorRoot />;
}
