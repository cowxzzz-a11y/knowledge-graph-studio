import { useSigma } from "@react-sigma/core";
import { getCameraStateToFitViewportToNodes } from "@sigma/utils";
import { FC, PropsWithChildren, useEffect } from "react";

const GraphViewportController: FC<PropsWithChildren> = ({ children }) => {
  const sigma = useSigma();

  useEffect(() => {
    let cancelled = false;

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const nodes = sigma.getGraph().nodes();
        if (!nodes.length || cancelled) return;

        const camera = sigma.getCamera();
        const state = getCameraStateToFitViewportToNodes(sigma, nodes);

        camera.setState({
          ...state,
          ratio: state.ratio * 1.02,
        });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [sigma]);

  return <>{children}</>;
};

export default GraphViewportController;
