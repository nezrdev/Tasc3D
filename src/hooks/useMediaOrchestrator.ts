import {
  type Dispatch,
  type SetStateAction,
  useMemo,
  useReducer,
} from "react";
import type { HeroVideoState } from "@/types/landing";

type GalaxyStatus = "pending" | "ready" | "unavailable";
type PackedAlphaOwner = "hero" | "services";
type DominoDirection = "forward" | "reverse";
type HeroMediaMode = "animated-fallback" | "poster" | "reduced" | "video";

export type MediaOrchestratorState = {
  clientsFlareArmed: boolean;
  datumMediaArmed: boolean;
  datumMediaFallback: boolean;
  datumMediaPrepared: boolean;
  dominoForwardFallback: boolean;
  dominoForwardPrepared: boolean;
  dominoMediaArmed: boolean;
  dominoReverseFallback: boolean;
  dominoReverseMediaArmed: boolean;
  dominoReversePrepared: boolean;
  galaxyStatus: GalaxyStatus;
  heroFallbackAnimationEligible: boolean;
  heroFallbackAnimationReady: boolean;
  heroVideoEligible: boolean;
  heroVideoState: HeroVideoState;
  interactiveGalaxyArmed: boolean;
  packedAlphaOwner: PackedAlphaOwner;
  servicesMediaArmed: boolean;
  servicesMediaFallback: boolean;
  servicesMediaPrepared: boolean;
  servicesStopPostersArmed: boolean;
  visionLogoArmed: boolean;
};

const INITIAL_MEDIA_STATE: MediaOrchestratorState = {
  clientsFlareArmed: false,
  datumMediaArmed: false,
  datumMediaFallback: false,
  datumMediaPrepared: false,
  dominoForwardFallback: false,
  dominoForwardPrepared: false,
  dominoMediaArmed: false,
  dominoReverseFallback: false,
  dominoReverseMediaArmed: false,
  dominoReversePrepared: false,
  galaxyStatus: "pending",
  heroFallbackAnimationEligible: false,
  heroFallbackAnimationReady: false,
  heroVideoEligible: false,
  heroVideoState: "pending",
  interactiveGalaxyArmed: false,
  packedAlphaOwner: "hero",
  servicesMediaArmed: false,
  servicesMediaFallback: false,
  servicesMediaPrepared: false,
  servicesStopPostersArmed: false,
  visionLogoArmed: false,
};

type MediaAction =
  | {
      key: keyof MediaOrchestratorState;
      type: "media/value-changed";
      value: unknown;
    }
  | { type: "services/armed" }
  | { type: "services/fallback-activated" }
  | { type: "services/recovered" }
  | { type: "services/warm-reset" }
  | { type: "datum/warm-reset" }
  | { type: "domino/warm-reset" }
  | {
      direction: DominoDirection;
      type: "domino/prepared";
    }
  | {
      direction: DominoDirection;
      type: "domino/fallback";
    }
  | {
      mode: HeroMediaMode;
      type: "hero/configured";
    }
  | { type: "hero/playback-ready" }
  | { type: "hero/playback-fallback" }
  | { type: "services/first-segment-prepared" }
  | { type: "services/prepared-invalidated" }
  | {
      owner: PackedAlphaOwner;
      type: "packed-alpha/owner-selected";
    };

const patchState = (
  state: MediaOrchestratorState,
  patch: Partial<MediaOrchestratorState>,
) => {
  const entries = Object.entries(patch) as Array<
    [keyof MediaOrchestratorState, MediaOrchestratorState[keyof MediaOrchestratorState]]
  >;
  if (entries.every(([key, value]) => Object.is(state[key], value))) {
    return state;
  }
  return { ...state, ...patch };
};

const mediaReducer = (
  state: MediaOrchestratorState,
  action: MediaAction,
): MediaOrchestratorState => {
  switch (action.type) {
    case "media/value-changed": {
      const current = state[action.key];
      const update = action.value;
      const next =
        typeof update === "function"
          ? (update as (value: typeof current) => typeof current)(current)
          : update;
      if (Object.is(current, next)) {
        return state;
      }
      return { ...state, [action.key]: next };
    }
    case "services/armed":
      return patchState(state, {
        servicesMediaArmed: true,
        servicesStopPostersArmed: true,
      });
    case "services/fallback-activated":
      return patchState(state, {
        servicesMediaFallback: true,
        servicesStopPostersArmed: true,
      });
    case "services/recovered":
      return patchState(state, {
        servicesMediaFallback: false,
        servicesMediaPrepared: true,
      });
    case "services/warm-reset":
      return patchState(state, {
        servicesMediaFallback: false,
        servicesMediaPrepared: false,
      });
    case "datum/warm-reset":
      return patchState(state, {
        datumMediaFallback: false,
        datumMediaPrepared: false,
      });
    case "domino/warm-reset":
      return patchState(state, {
        dominoForwardFallback: false,
        dominoForwardPrepared: false,
        dominoReverseFallback: false,
        dominoReversePrepared: false,
      });
    case "domino/prepared":
      return action.direction === "forward"
        ? patchState(state, {
            dominoForwardFallback: false,
            dominoForwardPrepared: true,
          })
        : patchState(state, {
            dominoReverseFallback: false,
            dominoReversePrepared: true,
          });
    case "domino/fallback":
      return action.direction === "forward"
        ? patchState(state, {
            dominoForwardFallback: true,
            dominoForwardPrepared: false,
          })
        : patchState(state, {
            dominoReverseFallback: true,
            dominoReversePrepared: false,
          });
    case "hero/configured": {
      if (action.mode === "video") {
        return patchState(state, {
          heroFallbackAnimationEligible: false,
          heroFallbackAnimationReady: false,
          heroVideoEligible: true,
          heroVideoState: "pending",
        });
      }
      if (action.mode === "animated-fallback") {
        return patchState(state, {
          heroFallbackAnimationEligible: true,
          heroFallbackAnimationReady: false,
          heroVideoEligible: false,
          heroVideoState: "fallback",
        });
      }
      return patchState(state, {
        heroFallbackAnimationEligible: false,
        heroFallbackAnimationReady: false,
        heroVideoEligible: false,
        heroVideoState: "fallback",
      });
    }
    case "hero/playback-ready":
      return patchState(state, { heroVideoState: "ready" });
    case "hero/playback-fallback":
      return patchState(state, { heroVideoState: "fallback" });
    case "services/first-segment-prepared":
      return patchState(state, {
        servicesMediaFallback: false,
        servicesMediaPrepared: true,
      });
    case "services/prepared-invalidated":
      return patchState(state, { servicesMediaPrepared: false });
    case "packed-alpha/owner-selected":
      return patchState(state, { packedAlphaOwner: action.owner });
  }
};

type MediaSetter<Key extends keyof MediaOrchestratorState> = Dispatch<
  SetStateAction<MediaOrchestratorState[Key]>
>;

const createMediaSetter = <Key extends keyof MediaOrchestratorState>(
  dispatch: Dispatch<MediaAction>,
  key: Key,
): MediaSetter<Key> =>
  (value) => {
    dispatch({ key, type: "media/value-changed", value });
  };

export const useMediaOrchestrator = () => {
  const [state, dispatch] = useReducer(mediaReducer, INITIAL_MEDIA_STATE);

  const actions = useMemo(
    () => ({
      activateServicesFallback: () =>
        dispatch({ type: "services/fallback-activated" }),
      armClientsFlare: () =>
        dispatch({
          key: "clientsFlareArmed",
          type: "media/value-changed",
          value: true,
        }),
      armDatum: () =>
        dispatch({
          key: "datumMediaArmed",
          type: "media/value-changed",
          value: true,
        }),
      armDomino: () =>
        dispatch({
          key: "dominoMediaArmed",
          type: "media/value-changed",
          value: true,
        }),
      armDominoReverse: () =>
        dispatch({
          key: "dominoReverseMediaArmed",
          type: "media/value-changed",
          value: true,
        }),
      armInteractiveGalaxy: () =>
        dispatch({
          key: "interactiveGalaxyArmed",
          type: "media/value-changed",
          value: true,
        }),
      armServices: () => dispatch({ type: "services/armed" }),
      armVisionLogo: () =>
        dispatch({
          key: "visionLogoArmed",
          type: "media/value-changed",
          value: true,
        }),
      configureHero: (mode: HeroMediaMode) =>
        dispatch({ mode, type: "hero/configured" }),
      invalidateServicesPrepared: () =>
        dispatch({ type: "services/prepared-invalidated" }),
      markHeroPlaybackFallback: () =>
        dispatch({ type: "hero/playback-fallback" }),
      markHeroPlaybackReady: () =>
        dispatch({ type: "hero/playback-ready" }),
      markServicesFirstSegmentPrepared: () =>
        dispatch({ type: "services/first-segment-prepared" }),
      markDominoFallback: (direction: DominoDirection) =>
        dispatch({ direction, type: "domino/fallback" }),
      markDominoPrepared: (direction: DominoDirection) =>
        dispatch({ direction, type: "domino/prepared" }),
      recoverServices: () => dispatch({ type: "services/recovered" }),
      resetDatumWarmState: () => dispatch({ type: "datum/warm-reset" }),
      resetDominoWarmState: () => dispatch({ type: "domino/warm-reset" }),
      resetServicesWarmState: () =>
        dispatch({ type: "services/warm-reset" }),
      selectPackedAlphaOwner: (owner: PackedAlphaOwner) =>
        dispatch({ owner, type: "packed-alpha/owner-selected" }),
    }),
    [],
  );

  const setters = useMemo(
    () => ({
      setClientsFlareArmed: createMediaSetter(dispatch, "clientsFlareArmed"),
      setDatumMediaArmed: createMediaSetter(dispatch, "datumMediaArmed"),
      setDatumMediaFallback: createMediaSetter(dispatch, "datumMediaFallback"),
      setDatumMediaPrepared: createMediaSetter(dispatch, "datumMediaPrepared"),
      setDominoForwardFallback: createMediaSetter(
        dispatch,
        "dominoForwardFallback",
      ),
      setDominoForwardPrepared: createMediaSetter(
        dispatch,
        "dominoForwardPrepared",
      ),
      setDominoMediaArmed: createMediaSetter(dispatch, "dominoMediaArmed"),
      setDominoReverseFallback: createMediaSetter(
        dispatch,
        "dominoReverseFallback",
      ),
      setDominoReverseMediaArmed: createMediaSetter(
        dispatch,
        "dominoReverseMediaArmed",
      ),
      setDominoReversePrepared: createMediaSetter(
        dispatch,
        "dominoReversePrepared",
      ),
      setGalaxyStatus: createMediaSetter(dispatch, "galaxyStatus"),
      setHeroFallbackAnimationEligible: createMediaSetter(
        dispatch,
        "heroFallbackAnimationEligible",
      ),
      setHeroFallbackAnimationReady: createMediaSetter(
        dispatch,
        "heroFallbackAnimationReady",
      ),
      setHeroVideoEligible: createMediaSetter(dispatch, "heroVideoEligible"),
      setHeroVideoState: createMediaSetter(dispatch, "heroVideoState"),
      setInteractiveGalaxyArmed: createMediaSetter(
        dispatch,
        "interactiveGalaxyArmed",
      ),
      setPackedAlphaOwner: createMediaSetter(dispatch, "packedAlphaOwner"),
      setServicesMediaArmed: createMediaSetter(
        dispatch,
        "servicesMediaArmed",
      ),
      setServicesMediaFallback: createMediaSetter(
        dispatch,
        "servicesMediaFallback",
      ),
      setServicesMediaPrepared: createMediaSetter(
        dispatch,
        "servicesMediaPrepared",
      ),
      setServicesStopPostersArmed: createMediaSetter(
        dispatch,
        "servicesStopPostersArmed",
      ),
      setVisionLogoArmed: createMediaSetter(dispatch, "visionLogoArmed"),
    }),
    [],
  );

  return { actions, setters, state };
};
