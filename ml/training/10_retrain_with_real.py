import os
import sys

import pandas as pd

real_path = "ml/data/raw/incidents_real.csv"
if not os.path.exists(real_path):
    sys.exit("incidents_real.csv nahi mili. Pehle admin page se export karo.")

real = pd.read_csv(real_path)
print("Verified incidents:", len(real))
if len(real) < 200:
    print("CHETAVNI: 200 se kam incidents hain. Model ko in par train karna bharosemand nahi hoga.")
    print("Abhi sirf data jama karte raho. Retrain tab karo jab kam se kam kuch sau alag din/jagah ke incidents hon.")
    sys.exit(0)

print("Kaafi data hai. Next: 06/07 scripts ko incidents_real.csv se chalao aur 09_train_model.py dobara run karo.")