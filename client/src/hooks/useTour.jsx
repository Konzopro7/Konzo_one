import { createContext, useContext, useMemo, useState } from "react";
import { useAuth } from "./useAuth.jsx";
import { productTourSteps } from "../lib/productTour.js";
import ProductTour from "../components/ProductTour.jsx";

const TourContext = createContext(null);

export function TourProvider({ children }) {
  const { user } = useAuth();
  const [index, setIndex] = useState(null);
  const steps = useMemo(() => productTourSteps(user?.role || "readonly"), [user?.role]);
  const value = { startTour: () => setIndex(0), stopTour: () => setIndex(null) };
  return (
    <TourContext.Provider value={value}>
      {children}
      {index !== null && <ProductTour key={`${user?.id}:${user?.role}`} steps={steps} index={Math.min(index, steps.length - 1)} onStep={setIndex} onClose={value.stopTour} />}
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) throw new Error("useTour doit être utilisé dans TourProvider.");
  return context;
}
