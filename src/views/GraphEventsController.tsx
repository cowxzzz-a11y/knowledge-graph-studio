import { useRegisterEvents } from "@react-sigma/core";
import { FC, PropsWithChildren, useEffect } from "react";

function getMouseLayer() {
  return document.querySelector(".sigma-mouse");
}

const GraphEventsController: FC<
  PropsWithChildren<{
    setHoveredNode: (node: string | null) => void;
    setSelectedNode: (node: string | null) => void;
  }>
> = ({ setHoveredNode, setSelectedNode, children }) => {
  const registerEvents = useRegisterEvents();

  useEffect(() => {
    registerEvents({
      clickNode({ node }) {
        setSelectedNode(node);
      },
      clickStage() {
        setSelectedNode(null);
      },
      enterNode({ node }) {
        setHoveredNode(node);
        const mouseLayer = getMouseLayer();
        if (mouseLayer) mouseLayer.classList.add("mouse-pointer");
      },
      leaveNode() {
        setHoveredNode(null);
        const mouseLayer = getMouseLayer();
        if (mouseLayer) mouseLayer.classList.remove("mouse-pointer");
      },
    });
  }, [registerEvents, setHoveredNode, setSelectedNode]);

  return <>{children}</>;
};

export default GraphEventsController;
