import { JarvisScreen } from "@/components/jarvis/JarvisScreen";
import { readVault } from "@/lib/vault";

export default function Home() {
  const notes = readVault();
  return <JarvisScreen notes={notes} />;
}
