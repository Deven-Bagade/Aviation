"""
Converts xgboost_results/model.pkl (an sklearn XGBClassifier, multi:softprob,
num_class=10) into ONNX so it can run client-side in the Electron/React app
alongside the existing TF.js models and the rul_xgb ONNX model — same pattern
as public/models/ai/rul_xgb/convert_rul_xgb_to_onnx.py.

Run this ONCE, offline, in a Python env that has the same major xgboost
version used for training (or newer).

    pip install xgboost onnxmltools onnx skl2onnx onnxruntime

Usage:
    python convert_classifier_xgb_to_onnx.py \
        --pkl /path/to/xgboost_results/model.pkl \
        --out "uav - Copy/public/models/ai/classifier_xgb"

This script also verifies the converted ONNX graph against the original
sklearn model's predict_proba() on random inputs before writing anything,
and aborts if they disagree beyond a small numerical tolerance.
"""

import argparse
import json
import os
import pickle

import numpy as np
from onnxmltools import convert_xgboost
from onnxmltools.convert.common.data_types import FloatTensorType

# Must match the exact column order the model was trained on. Confirmed from
# this repo: public/models/ai/classifier/meta.json (the existing TF.js
# classifier) lists this exact 16-feature schema, and it's the same schema
# scripts/train.js / featureConfig.json use — no "degradation" feature here
# (unlike rul_xgb), since this is a point-in-time fault classifier, not RUL.
FEATURE_ORDER = [
    "rpm", "cht", "egt", "oilPressure", "oilTemperature", "fuelFlow",
    "vibration", "batteryVoltage", "alternatorCurrent", "throttle",
    "chtResidual", "egtResidual", "oilPressureResidual",
    "oilTemperatureResidual", "vibrationResidual", "fuelFlowResidual",
]

# Must match the order of the classifier's classes_ (verified to be [0..9]
# in the shipped model.pkl) — same order as src/ai/faultLabels.json, which
# is also what results.json's per_class_report keys line up with.
LABELS = [
    "NONE", "HIGH_TEMP", "LOW_OIL", "HIGH_VIBRATION", "ELECTRICAL",
    "FUEL_SYSTEM", "ABNORMAL_RPM", "COOLING_FAULT", "INJECTOR_FAULT",
    "SENSOR_FAULT",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pkl", required=True, help="Path to model.pkl")
    ap.add_argument("--out", required=True, help="Output dir, e.g. public/models/ai/classifier_xgb")
    args = ap.parse_args()

    with open(args.pkl, "rb") as f:
        model = pickle.load(f)

    assert model.n_features_in_ == len(FEATURE_ORDER), (
        f"Model expects {model.n_features_in_} features but FEATURE_ORDER has "
        f"{len(FEATURE_ORDER)}. Double-check the schema before converting."
    )
    n_classes = len(getattr(model, "classes_", []))
    assert n_classes == len(LABELS), (
        f"Model has {n_classes} classes but LABELS has {len(LABELS)}. "
        f"Double-check class order (model.classes_) before converting."
    )
    assert list(model.classes_) == list(range(len(LABELS))), (
        f"model.classes_ = {model.classes_} is not a plain 0..N range — "
        f"the LABELS order assumption above is not safe. Fix LABELS to match "
        f"before converting."
    )

    initial_type = [("input", FloatTensorType([None, len(FEATURE_ORDER)]))]
    onnx_model = convert_xgboost(model, initial_types=initial_type)

    # --- Verify the ONNX graph matches the sklearn model before shipping ---
    import onnxruntime as ort

    sess = ort.InferenceSession(
        onnx_model.SerializeToString(), providers=["CPUExecutionProvider"]
    )
    rng = np.random.default_rng(42)
    X = rng.random((200, len(FEATURE_ORDER)), dtype=np.float32)
    sk_probs = model.predict_proba(X)
    onnx_label, onnx_probs = sess.run(None, {"input": X})
    max_diff = float(np.max(np.abs(sk_probs - onnx_probs)))
    assert max_diff < 1e-4, (
        f"ONNX output diverged from sklearn predict_proba by {max_diff} — "
        f"do not ship this conversion, investigate the xgboost/onnxmltools "
        f"version mismatch first."
    )
    assert (sk_probs.argmax(axis=1) == onnx_label).all(), (
        "ONNX predicted labels disagree with sklearn argmax on the sanity check."
    )
    print(f"Verified: ONNX vs sklearn max abs prob diff = {max_diff:.2e} (OK)")

    os.makedirs(args.out, exist_ok=True)
    onnx_path = os.path.join(args.out, "model.onnx")
    with open(onnx_path, "wb") as f:
        f.write(onnx_model.SerializeToString())

    label_output_name = onnx_model.graph.output[0].name
    probability_output_name = onnx_model.graph.output[1].name
    input_name = onnx_model.graph.input[0].name

    meta = {
        "labels": LABELS,
        "features": FEATURE_ORDER,
        "input_name": input_name,
        "label_output_name": label_output_name,
        "probability_output_name": probability_output_name,
        "note": (
            "Converted from xgboost_results/model.pkl (XGBClassifier, "
            "multi:softprob, num_class=10). Verified against "
            "model.predict_proba() before writing (see script output above)."
        ),
    }
    with open(os.path.join(args.out, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    print(f"Wrote {onnx_path}")
    print(f"ONNX input tensor name:       {input_name}")
    print(f"ONNX label output name:      {label_output_name}")
    print(f"ONNX probability output name: {probability_output_name}")
    print("Wrote meta.json alongside it.")


if __name__ == "__main__":
    main()