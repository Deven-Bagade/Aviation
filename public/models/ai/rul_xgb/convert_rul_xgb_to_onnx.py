"""
Converts rul_xgboost_results/model.pkl (an sklearn XGBRegressor) into ONNX
so it can run client-side in the Electron/React app alongside the existing
TF.js models, instead of needing a Python process at runtime.

Run this ONCE, offline, in a Python env that has the same major xgboost
version used for training (or newer). It does not touch the running app.

    pip install xgboost onnxmltools onnx skl2onnx

Usage:
    python convert_rul_xgb_to_onnx.py \
        --pkl /path/to/model.pkl \
        --out "uav - Copy/public/models/ai/rul_xgb"
"""

import argparse
import json
import os
import pickle

from onnxmltools import convert_xgboost
from onnxmltools.convert.common.data_types import FloatTensorType

# Must match the exact column order the model was trained on.
# Confirmed from this repo: public/models/ai/rul/meta.json lists the same
# 17-feature schema (16 normalized telemetry features + "degradation") that
# scripts/train.js uses for the existing TF.js RUL model, and results.json's
# top_feature_importance names (oilPressure, cht, batteryVoltage, egt,
# vibrationResidual, oilTemperatureResidual, chtResidual, degradation) are
# all present in this exact list.
FEATURE_ORDER = [
    "rpm", "cht", "egt", "oilPressure", "oilTemperature", "fuelFlow",
    "vibration", "batteryVoltage", "alternatorCurrent", "throttle",
    "chtResidual", "egtResidual", "oilPressureResidual",
    "oilTemperatureResidual", "vibrationResidual", "fuelFlowResidual",
    "degradation",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pkl", required=True, help="Path to model.pkl")
    ap.add_argument("--out", required=True, help="Output dir, e.g. public/models/ai/rul_xgb")
    args = ap.parse_args()

    with open(args.pkl, "rb") as f:
        model = pickle.load(f)

    assert model.n_features_in_ == len(FEATURE_ORDER), (
        f"Model expects {model.n_features_in_} features but FEATURE_ORDER has "
        f"{len(FEATURE_ORDER)}. Double-check the schema before converting."
    )

    initial_type = [("input", FloatTensorType([None, len(FEATURE_ORDER)]))]
    onnx_model = convert_xgboost(model, initial_types=initial_type)

    os.makedirs(args.out, exist_ok=True)
    onnx_path = os.path.join(args.out, "model.onnx")
    with open(onnx_path, "wb") as f:
        f.write(onnx_model.SerializeToString())

    # Print the graph's actual input/output tensor names - onnxruntime-web
    # needs these to match exactly when you call session.run().
    input_name = onnx_model.graph.input[0].name
    output_name = onnx_model.graph.output[0].name

    meta = {
        "features": FEATURE_ORDER,
        "input_name": input_name,
        "output_name": output_name,
        "output_unit": "hours",  # unlike the TF.js model, no *scale needed
        "note": (
            "degradation scaling (raw 0-100 vs /100) was not confirmed from "
            "the training script - validate against a known sample before "
            "trusting predictions, see rulXgb.ts comment."
        ),
    }
    with open(os.path.join(args.out, "meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    print(f"Wrote {onnx_path}")
    print(f"ONNX input tensor name:  {input_name}")
    print(f"ONNX output tensor name: {output_name}")
    print("Wrote meta.json alongside it.")


if __name__ == "__main__":
    main()