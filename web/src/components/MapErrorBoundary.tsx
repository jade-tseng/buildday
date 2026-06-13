import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  failed: boolean;
}

// MapLibre needs a WebGL context. If it can't get one (locked-down browser,
// headless without GPU, etc.) we degrade gracefully instead of taking the
// whole app down — the dispatch panel still works as the spatial story.
export default class MapErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="map-fallback mono">
          <span>⌖ satellite layer unavailable — WebGL context could not be created</span>
        </div>
      );
    }
    return this.props.children;
  }
}
