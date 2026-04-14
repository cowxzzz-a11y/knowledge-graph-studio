import { useSigma } from "@react-sigma/core";
import { getCameraStateToFitViewportToNodes } from "@sigma/utils";
import { FC, PropsWithChildren, useEffect } from "react";

type Props = PropsWithChildren<{
  viewportKey: string;
}>;

const GraphViewportController: FC<Props> = ({ viewportKey, children }) => {
  const sigma = useSigma();

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let attempts = 0;

    const fitViewport = () => {
      if (cancelled) return;

      const nodes = sigma.getGraph().nodes();
      if (!nodes.length) {
        attempts += 1;
        if (attempts < 24) {
          frame = requestAnimationFrame(fitViewport);
        }
        return;
      }

      const camera = sigma.getCamera();
      const state = getCameraStateToFitViewportToNodes(sigma, nodes);

      camera.setState({
        ...state,
        ratio: state.ratio * 1.08,
      });
    };

    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(fitViewport);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [sigma, viewportKey]);

  return <>{children}</>;
};

export default GraphViewportController;
