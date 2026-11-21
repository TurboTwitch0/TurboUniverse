import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode; name: string };

export default class SectionBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <section className="empty-state" role="alert">
        <h2>{this.props.name} couldn’t load.</h2>
        <p>Check your connection and reload to try again.</p>
        <button className="secondary-button" onClick={() => window.location.reload()}>Reload section</button>
      </section>;
    }
    return this.props.children;
  }
}
