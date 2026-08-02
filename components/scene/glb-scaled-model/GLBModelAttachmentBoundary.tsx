"use client";

import { Component, useEffect, type ReactNode } from "react";

type GLBModelAttachmentBoundaryProps = {
  children: ReactNode;
  onAttached: () => void;
  onAttachmentError: () => void;
  resetKey: string;
};
type GLBModelAttachmentBoundaryState = {
  failed: boolean;
  resetKey: string;
};

function AttachmentCommit({
  children,
  onAttached,
}: Pick<GLBModelAttachmentBoundaryProps, "children" | "onAttached">) {
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) onAttached();
    });
    return () => {
      cancelled = true;
    };
  }, [onAttached]);
  return children;
}

export class GLBModelAttachmentBoundary extends Component<
  GLBModelAttachmentBoundaryProps,
  GLBModelAttachmentBoundaryState
> {
  state: GLBModelAttachmentBoundaryState = {
    failed: false,
    resetKey: this.props.resetKey,
  };

  static getDerivedStateFromProps(
    props: GLBModelAttachmentBoundaryProps,
    state: GLBModelAttachmentBoundaryState
  ) {
    return props.resetKey === state.resetKey
      ? null
      : { failed: false, resetKey: props.resetKey };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onAttachmentError();
  }

  render() {
    if (this.state.failed) return null;
    return (
      <AttachmentCommit
        key={this.props.resetKey}
        onAttached={this.props.onAttached}
      >
        {this.props.children}
      </AttachmentCommit>
    );
  }
}
