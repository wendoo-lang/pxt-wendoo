import { useMakeCodeSession, useMakeCodeSessionStatus } from "@/contexts/makecode-session";

/**
 * Root view.
 *
 * The editor surface is gated on a ready session: until the simx connects and
 * serves its files, there is no environment to edit against.
 */
export function App() {
  const session = useMakeCodeSession();
  const status = useMakeCodeSessionStatus();

  if (status !== "ready") {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-xl font-semibold">Wendoo</h1>
        <p className="text-muted-foreground text-sm">
          {status === "connecting" ? "Waiting for the MakeCode project..." : "Not connected."}
        </p>
        {session.joinCode ? <p className="font-mono text-sm">Join code: {session.joinCode}</p> : null}
        {status === "idle" ? (
          <button type="button" className="underline" onClick={() => session.connect()}>
            Connect
          </button>
        ) : null}
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">Wendoo</h1>
      <p className="text-muted-foreground text-sm">Connected. Editor surface goes here.</p>
    </main>
  );
}
