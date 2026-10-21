// A crash in the map shows its message and resets on the next session, so the pickers above stay usable.
import { Component, type ReactNode } from "react";

export class MapBoundary extends Component<{ session: string | null; children: ReactNode }, { error: string | null; session: string | null }> {
  override state = { error: null as string | null, session: this.props.session };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  static getDerivedStateFromProps(props: { session: string | null }, state: { error: string | null; session: string | null }) {
    return props.session === state.session ? null : { error: null, session: props.session };
  }

  override render() {
    return this.state.error ? <div className="splash">Map error: {this.state.error}</div> : this.props.children;
  }
}
