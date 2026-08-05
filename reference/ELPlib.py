# This file is for the Elastic Wave propagation analysis library
# It contains the following classes:
# - Oscillo/OscilloCsv : handles the osilloscope data and provides data lists of start/arriaval time etc.
# - Chooser/FileChooser/FolderChooser : provides the file/folder chooser dialog for the user
# - OscilloDataAnalyzer : provides the graph window for the user to select the start/arrival time of the wave

import os
import numpy as np

import tkinter as tk
from tkinter import filedialog
import sys
import asammdf

from scipy.signal import find_peaks
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpec
from matplotlib.axes import Axes

from scipy.signal import butter, filtfilt

# Base class
class Oscillo:
    def __init__(self, fullpath, Trim_mode = False, Offset_mode = True, AmpGainfactor = 1, trim_start=-50, trim_end=800, LPF_cutoff_freq_hz=None):
        self._Time_raw: np.ndarray = np.array([]) # Time data 
        self._Input_raw: np.ndarray = np.array([]) # Input data
        self._Receiver_raw: np.ndarray = np.array([]) # Receiver data
        self._xselected = None
        self._fullpath = fullpath
        self._Trim_mode = Trim_mode
        self._Offset_mode = Offset_mode
        self._AmpGainfactor = AmpGainfactor
        self.trim_start_time = trim_start # us
        self.trim_end_time = trim_end # us
        self.LPF_cutoff_freq_hz = LPF_cutoff_freq_hz
        _filename = os.path.basename(fullpath)
        self._dict = {'File_Name': _filename, 'STS_s(us)': None, 'STS_s(V)': None, 'STS_a(us)': None,
                        'STS_a(V)': None,  'PTP_s(us)': None, 'PTP_s(V)': None, 'PTP_a(us)': None, 'PTP_a(V)': None,
                        'STS_deltaT(us)': None, 'PTP_deltaT(us)': None}
    def SetXselected(self, x):
        self._xselected = x
    def GetXselected(self):
        return self._xselected
    def GetFileName(self):
        return os.path.basename(self._fullpath)
    def GetFileNameWOext(self):
        filename_WOext, _ = os.path.splitext(os.path.basename(self._fullpath))
        return filename_WOext
    def GetFullPath(self):
        return self._fullpath
    def GetALLdataRaw(self):
        return (self._Time_raw, self._Input_raw, self._Receiver_raw)
    def GetTimedata(self):
        return self._Time_raw
    def GetIndata(self):
        return self._Input_raw
    def GetReceiverdata(self):
        return self._Receiver_raw
    def GetTrimIndex(self):
        trim_start_idx = np.abs(self._Time_raw - self.trim_start_time).argmin()
        trim_end_idx = np.abs(self._Time_raw - self.trim_end_time).argmin()
        return (trim_start_idx, trim_end_idx)
    def GetALLdataTrimmed(self):
        trim_s_idx, trim_e_idx = self.GetTrimIndex()
        return (self._Time_raw[trim_s_idx:trim_e_idx], self._Input_raw[trim_s_idx:trim_e_idx], self._Receiver_raw[trim_s_idx:trim_e_idx])
    def GetIndataOffset(self):
        return self._Input_raw - self._Input_raw[0]
    def GetReceiverdataOffset(self):
        return self._Receiver_raw - self._Receiver_raw[0]
    def GetALLdataOffset(self):
        return (self._Time_raw, self.GetIndataOffset(), self.GetReceiverdataOffset())
    def GetALLdataTrimmedOffset(self):
        trim_start_idx, trim_end_idx = self.GetTrimIndex()
        return (self._Time_raw[trim_start_idx:trim_end_idx], self.GetIndataOffset()[trim_start_idx:trim_end_idx],
                self.GetReceiverdataOffset()[trim_start_idx:trim_end_idx])
    def GetALLdata(self):
        if self._Trim_mode:
            if self._Offset_mode:
                return self.GetALLdataTrimmedOffset()
            else:
                return self.GetALLdataTrimmed()
        else:
            if self._Offset_mode:
                return self.GetALLdataOffset()
            else:
                return self.GetALLdataRaw()
    def SetDictval(self, key, value):
        self._dict[key] = value
    def GetDictval(self, key):
        return self._dict[key]
    def GetDictvalAll(self):
        return self._dict
    def GetTrimMode(self):
        return self._Trim_mode
    def GetOffsetMode(self):
        return self._Offset_mode
    def ApplyLPF(self, cutoff_freq_hz, order=4):
        """
        Receiverデータにローパスフィルタを適用（_Receiver_rawに上書き）
        
        Args:
            cutoff_freq_hz (float): カットオフ周波数 [Hz]
            order (int): フィルタの次数（デフォルト: 4）
        """
        if cutoff_freq_hz == 0 or cutoff_freq_hz is None:
            return
        
        if len(self._Time_raw) < 2:
            print("警告: Time データが不足しています")
            return
        
        # サンプリングレートを計算 (us -> s に変換)
        time_diff_us = np.diff(self._Time_raw)
        time_diff_s = time_diff_us / 1_000_000
        sampling_rate = 1.0 / np.mean(time_diff_s)
        
        # ナイキスト周波数を計算
        nyquist_freq = sampling_rate / 2
        
        if cutoff_freq_hz >= nyquist_freq:
            print(f"警告: カットオフ周波数 ({cutoff_freq_hz} Hz) がナイキスト周波数 ({nyquist_freq} Hz) 以上です")
            return
        
        # バターワースフィルタの設計
        normalized_cutoff = cutoff_freq_hz / nyquist_freq
        butter_result = butter(order, normalized_cutoff, btype='low')
        if butter_result is None or not isinstance(butter_result, tuple) or len(butter_result) != 2:
            print("警告: butter関数の返り値が不正です")
            return
        b, a = butter_result
        
        # フィルタを適用して_Receiver_rawに上書き（前後処理で位相ずれを補正）
        self._Receiver_raw = filtfilt(b, a, self._Receiver_raw)
        print(f"LPF適用完了: カットオフ周波数 = {cutoff_freq_hz} Hz")
    

# 継承クラス MDF4用(自動制御PCで取得したデータ用)
class OscilloMdf4(Oscillo):
    def __init__(self, fullpath, Trim_mode=False, Offset_mode=True, AmpGainfactor=20, trim_start=-50, trim_end=800, LPF_cutoff_freq_hz=None):
        super().__init__(fullpath, Trim_mode, Offset_mode, AmpGainfactor, trim_start, trim_end, LPF_cutoff_freq_hz)
        print('\tMDF4 file path: ' + fullpath)
        # Open the MDF4 file with '\n' as the line break
        mdf = asammdf.MDF(fullpath)
        self._Time_raw = mdf.get('Transmitter').timestamps * 1_000_000  # s -> us
        self._Input_raw = mdf.get('Transmitter').samples * AmpGainfactor
        self._Receiver_raw = mdf.get('Receiver').samples
        if LPF_cutoff_freq_hz is not None:
            self.ApplyLPF(LPF_cutoff_freq_hz)

# 継承クラス CSV用(BristolでPicoScopeで取得したデータ用)
class OscilloCsvBristol(Oscillo):
    def __init__(self, fullpath, Trim_mode=False, Offset_mode=True, AmpGainfactor=20, trim_start=-50, trim_end=800, LPF_cutoff_freq_hz=None):
        super().__init__(fullpath, Trim_mode, Offset_mode, AmpGainfactor, trim_start, trim_end, LPF_cutoff_freq_hz)
        print('\tCSV file path: ' + fullpath)
        data = np.loadtxt(fullpath, delimiter=',', skiprows=1)
        self._Time_raw = data[:, 0] * 1_000  # ms -> us
        self._Input_raw = data[:, 2] * AmpGainfactor
        self._Receiver_raw = data[:, 1] * 0.001 # mV -> V
        if LPF_cutoff_freq_hz is not None:
            self.ApplyLPF(LPF_cutoff_freq_hz)

class Chooser:
# ファイルやフォルダ選択のダイアログを表示するための基底クラス
    def __init__(self, init_dir=None):
        self.root = tk.Tk()
        self.root.withdraw()
        self.root.attributes("-topmost", True)
        if init_dir is None:
            self.init_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        else:
            self.init_dir = init_dir
    
    def get_user_confirmation(self):
        while True:
            response = input("これでいいですか？ (y/n): ")
            if response.lower() in ['y', 'n']:
                return response.lower()
            print("無効な入力です。'y' または 'n' を入力してください。")


class FileChooser(Chooser):
# 複数のファイルを選択するためのクラス
    def choose_files(self, ext='.csv'):
        # ファイル選択ダイアログを表示し、ユーザーの確認を得る
        while True:
            file_paths = filedialog.askopenfilenames(title='ファイルを選択してください',
                                                     initialdir=self.init_dir,
                                                     filetypes=[(ext + ' files', '*' + ext)])
            if not file_paths:
                print("ファイルが選択されませんでした。終了します。")
                sys.exit()

            # 選択されたファイルを出力
            print("\n選択されたファイル:")
            for path in file_paths:
                print(path)
            print("合計で{}個のファイルが選択されました。".format(len(file_paths)))

            # ユーザー確認
            if self.get_user_confirmation() == 'y':
                return file_paths
            print("再度ファイルを選択してください。")

class FileChooserSpecifiedDirection(Chooser):
# 複数のファイルを選択するためのクラス
    def choose_files(self, ext='.csv', wave_direction='Svh', wave_frequency=0):
        # ファイル選択ダイアログを表示し、ユーザーの確認を得る
        while True:
            if wave_frequency == 0: # 周波数指定がない場合
                file_paths = filedialog.askopenfilenames(title='ファイルを選択してください',
                                                     initialdir=self.init_dir,
                                                     filetypes=[(ext + ' files', '*' + wave_direction + '*' + ext)])
            else: # 周波数指定がある場合
                file_paths = filedialog.askopenfilenames(title='ファイルを選択してください',
                                                        initialdir=self.init_dir,
                                                        filetypes=[(ext + ' files', '*' + wave_direction + '*' + str(wave_frequency) + 'Hz' + '*' + ext)])
            if not file_paths:
                print("ファイルが選択されませんでした。終了します。")
                sys.exit()

            # 選択されたファイルを出力
            print("\n選択されたファイル:")
            for path in file_paths:
                print(path)
            print("合計で{}個のファイルが選択されました。".format(len(file_paths)))

            # ユーザー確認
            if self.get_user_confirmation() == 'y':
                return file_paths
            print("再度ファイルを選択してください。")

class FolderChooser(Chooser):
# フォルダを選択するためのクラス
    def choose_folder(self):
        # フォルダ選択ダイアログを表示し、ユーザーの確認を得る
        while True:
            folder_path = filedialog.askdirectory(title='フォルダを選択してください',
                                                     initialdir=self.init_dir)
            if not folder_path:
                print("フォルダが選択されませんでした。終了します。")
                sys.exit()

            # 選択されたフォルダを出力
            print("\n選択されたフォルダ:")
            print(folder_path)

            # ユーザー確認
            if self.get_user_confirmation() == 'y':
                return folder_path
            print("再度フォルダを選択してください。")

class OscilloDataAnalyzer:
    # Class variable to store zoom state across instances
    # This ensures the zoom level persists when processing multiple data files sequentially
    _zoom_state = 0  # 0=100%, 1=70%, 2=50%, 3=30%, 4=20%, 5=15%, 6=10%
    # Class variable to store previous receiver waveform data
    _prev_receiver_time = None
    _prev_receiver_data = None
    
    def __init__(self, oscData, save_dir, past10files_name=[], past10files_Trise=[], past10files_Rrise=[], past10files_Rpeak=[]):
        self.oscData = oscData
        self.save_dir = save_dir
        self.Time: np.ndarray
        self.Input: np.ndarray
        self.Receiver: np.ndarray
        self.past_files_name = past10files_name
        self.past10files_Trise = past10files_Trise
        self.past10files_Rrise = past10files_Rrise
        self.past10files_Rpeak = past10files_Rpeak
        self.x_min = None  # Store original x-axis minimum
        self.x_max = None  # Store original x-axis maximum
        self._is_canceled = False

    def run(self):
        self.plot_initial_data() # 初期プロット関数
        self.connect_events()  # コンストラクタで一度だけイベントを接続
        self.show()  # グラフを表示
        if not self._is_canceled:
            self.save_graph() # グラフを保存

    def cancel_analysis(self):
        keys_to_clear = [
            'STS_s(us)', 'STS_s(V)', 'STS_a(us)', 'STS_a(V)',
            'PTP_s(us)', 'PTP_s(V)', 'PTP_a(us)', 'PTP_a(V)',
            'STS_deltaT(us)', 'PTP_deltaT(us)'
        ]
        for key in keys_to_clear:
            self.oscData.SetDictval(key, None)

        self._is_canceled = True
        plt.close(self.fig)
        self.disconnect_events()

    def on_left_click(self, event):
        if event.inaxes is None: # グラフ外でクリックされたらpass
            return

        # クリックされたaxに対応する線(一回前のクリック分)を削除
        for ln in self.lines[event.inaxes]:
            ln.remove()
        self.lines[event.inaxes].clear()

        # クリックされた点に最も近いデータポイントを探す(Start to start法に対応する点)
        click_x = event.xdata
        STS_index = np.abs(self.Time - click_x).argmin()
        ln_STS = event.inaxes.axvline(x=self.Time[STS_index], color="red")
        self.lines[event.inaxes].append(ln_STS)

        # annotationを追加
        if event.inaxes == self.ax[0]:
            dif = self.Time[STS_index] - self.past10files_Trise[-1] if len(self.past10files_Trise) > 0 else 0
        else:
            dif = self.Time[STS_index] - self.past10files_Rrise[-1] if len(self.past10files_Rrise) > 0 else 0
        annotation_STS = event.inaxes.annotate(
            f'{self.Time[STS_index]:.1f}us\n(Δ{dif:.1f}us)',  # 表示するテキスト (小数点以下3桁)
            xy=(self.Time[STS_index], event.inaxes.get_ylim()[1]),  # アノテーションの位置
            xytext=(-50, -27),  # テキスト位置のオフセット
            textcoords='offset points',  # テキスト位置の座標系
            fontsize=10,
            color='red',
            bbox=dict(boxstyle="round,pad=0.3", edgecolor='red', facecolor='white')
            )
        self.lines[event.inaxes].append(annotation_STS)

        ## クリックされた点より右側で、yがピークになる点を探す(Peak to Peak法に対応する点)
        # 対応するデータを使用
        if event.inaxes == self.ax[0]:
            y_data = self.Input
            # find_peaksではなく、argmaxでピークを探す
            PTP_index = np.argmax(y_data)
        else:
            y_data = self.Receiver
            peaks, _ = find_peaks(y_data[STS_index:], width=50)
            if peaks.size > 0:
                PTP_index = STS_index + peaks[0]
            else: # ピークが見つからない場合（ノイズが多すぎるとこうなることがある）は、仕方ないのでSTSの点をPTPとする
                PTP_index = STS_index
        # 線を描画
        ln_PTP = event.inaxes.axvline(x=self.Time[PTP_index], color="green")
        # 線をリストに追加
        self.lines[event.inaxes].append(ln_PTP)

        # x座標を表示するアノテーションを追加
        dif = self.Time[PTP_index] - self.past10files_Rpeak[-1] if len(self.past10files_Rpeak) > 0 else 0
        annotation_PTP = event.inaxes.annotate(
            f'{self.Time[PTP_index]:.1f}us\n(Δ{dif:.1f}us)',
            xy=(self.Time[PTP_index], event.inaxes.get_ylim()[1]),
            xytext=(7, -27),
            textcoords='offset points',
            fontsize=10,
            color='green',
            bbox=dict(boxstyle="round,pad=0.3", edgecolor='green', facecolor='white')
        )
        self.lines[event.inaxes].append(annotation_PTP)
                
        # oscDataのDictに値をセット
        if event.inaxes == self.ax[0]:
            self.oscData.SetDictval('STS_s(us)', self.Time[STS_index])
            self.oscData.SetDictval('STS_s(V)', self.Input[STS_index])
            self.oscData.SetDictval('PTP_s(us)', self.Time[PTP_index])
            self.oscData.SetDictval('PTP_s(V)', self.Input[PTP_index])
        else:
            self.oscData.SetDictval('STS_a(us)', self.Time[STS_index])
            self.oscData.SetDictval('STS_a(V)', self.Receiver[STS_index])
            self.oscData.SetDictval('PTP_a(us)', self.Time[PTP_index])
            self.oscData.SetDictval('PTP_a(V)', self.Receiver[PTP_index])
            
        # 新たに縦線を描画    
        plt.draw()

    def on_right_click(self, event): # 右クリックはPTPに対応
        if event.inaxes is None: # グラフ外でクリックされたらpass
            return
        # クリックされたaxに対応するPTPの線（緑色の線）を削除
        lines = self.lines[event.inaxes]
        lines_to_remove = [line for line in lines if line.get_color() == 'green']
        for line in lines_to_remove:
            line.remove() # グラフから線を削除
            lines.remove(line) # リストから線を削除
        
        # 対応するデータを使用しピークを探す
        if event.inaxes == self.ax[0]: # クリックされたのがInputのグラフの場合
            y_data = self.Input
            # find_peaksではなく、argmaxでピークを探す
            PTP_index = np.argmax(y_data)
        else: # クリックされたのがOutputのグラフの場合
            # クリックされた点のインデックスを取得
            click_x = event.xdata
            # クリックされた点に最も近いデータポイントを探す(Start to start法に対応する点)
            PTP_index = np.abs(self.Time - click_x).argmin()
            
        # 線を描画
        ln_PTP = event.inaxes.axvline(x=self.Time[PTP_index], color="green")
        # 線をリストに追加
        self.lines[event.inaxes].append(ln_PTP)

        # x座標を表示するアノテーションを追加
        dif = self.Time[PTP_index] - self.past10files_Rpeak[-1] if len(self.past10files_Rpeak) > 0 else 0
        annotation_PTP = event.inaxes.annotate(
            f'{self.Time[PTP_index]:.1f}us\n(Δ{dif:.1f}us)',
            xy=(self.Time[PTP_index], event.inaxes.get_ylim()[1]),
            xytext=(7, -27),
            textcoords='offset points',
            fontsize=10,
            color='green',
            bbox=dict(boxstyle="round,pad=0.3", edgecolor='green', facecolor='white')
        )
        self.lines[event.inaxes].append(annotation_PTP)
            
        # oscDataのDictに値をセット
        if event.inaxes == self.ax[0]:
            self.oscData.SetDictval('PTP_s(us)', self.Time[PTP_index])
            self.oscData.SetDictval('PTP_s(V)', self.Input[PTP_index])
        else:
            self.oscData.SetDictval('PTP_a(us)', self.Time[PTP_index])
            self.oscData.SetDictval('PTP_a(V)', self.Receiver[PTP_index])
    
        plt.draw()

    def on_key_press(self, event):
        if event.key == 'enter':
            # 各軸に2本以上の線が存在するか確認
            if len(self.lines[self.ax[0]]) >= 2 and len(self.lines[self.ax[1]]) >= 2:
                self.close()
        elif event.key == 'z':
            # Cycle through zoom states: 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 0 ...
            OscilloDataAnalyzer._zoom_state = (OscilloDataAnalyzer._zoom_state + 1) % 7
            self.update_zoom()
        elif event.key == 'escape':
            self.cancel_analysis()

    def connect_events(self):
        self.cid_click = self.fig.canvas.mpl_connect('button_press_event', self.on_click)
        self.cid_key = self.fig.canvas.mpl_connect('key_press_event', self.on_key_press)
        
    def on_click(self, event):
        if event.button == 1:  # 左クリック
            self.on_left_click(event)
        elif event.button == 3:  # 右クリック
            self.on_right_click(event)
    
    def disconnect_events(self):
        self.fig.canvas.mpl_disconnect(self.cid_click)
        self.fig.canvas.mpl_disconnect(self.cid_key)
    
    def plot_initial_data(self):
        # 初期プロット関数
        self.fig, self.ax = plt.subplots(2, 1)
        self.fig.suptitle('Click the start (rise) point in each graph (LEFT click). Press Z key to zoom. Push ENTER key to confirm.')
        self.lines = {self.ax[0]: [], self.ax[1]: []}  # 各グラフの線のリストを管理
        self.Time, self.Input, self.Receiver = self.oscData.GetALLdata()
        self.ax[0].set_title(self.oscData.GetFullPath() + ' (Trigger)', fontname='Meiryo')
        self.ax[1].set_title(self.oscData.GetFullPath() + ' (Receiver)', fontname='Meiryo')
        self.ax[0].plot(self.Time, self.Input, color='blue')
        
        # Plot previous receiver waveform if it exists (semi-transparent)
        if OscilloDataAnalyzer._prev_receiver_time is not None and OscilloDataAnalyzer._prev_receiver_data is not None:
            # normalize the previous receiver data for better visualization (normalize by max absolute value)
            norm_factor_prev = np.max(np.abs(OscilloDataAnalyzer._prev_receiver_data))
            self.ax[1].plot(OscilloDataAnalyzer._prev_receiver_time, OscilloDataAnalyzer._prev_receiver_data / norm_factor_prev, 
                            color='blue', alpha=0.3, linewidth=1)
        
        # Plot current receiver waveform (normalized by max absolute value for better visualization)
        norm_factor_current = np.max(np.abs(self.Receiver))
        self.ax[1].plot(self.Time, self.Receiver / norm_factor_current, color='blue')
        
        for i in range(2):
            self.ax[i].set_ylabel('Voltage (V)', fontname='Meiryo')
            self.ax[i].set_xlabel('Time (us)', fontname='Meiryo')
            self.ax[i].grid()
        
        # Store the original x-axis limits
        self.x_min = self.Time.min()
        self.x_max = self.Time.max()
        
        # Apply the current zoom state
        self.update_zoom()

    def update_zoom(self):
        """Update the x-axis range based on the current zoom state."""
        # Guard against uninitialized x-axis limits
        if self.x_min is None or self.x_max is None:
            return
            
        # Zoom percentages: 0=100%, 1=70%, 2=50%, 3=30%, 4=20%, 5=15%, 6=10%
        zoom_percentages = [1.0, 0.7, 0.5, 0.3, 0.2, 0.15, 0.1]
        percentage = zoom_percentages[OscilloDataAnalyzer._zoom_state]
        
        # Calculate new x_max (left side of the range, earlier in time)
        new_x_max = self.x_min + (self.x_max - self.x_min) * percentage
        
        # Update only the first two axes (graph axes, not table axis)
        for i in range(min(2, len(self.ax))):
            self.ax[i].set_xlim(self.x_min, new_x_max)
        
        # Redraw the canvas
        plt.draw()

    def show(self):
        plt.get_current_fig_manager().window.state('zoomed') # type: ignore
        plt.show()
        
    def close(self):
        plt.close(self.fig)
        self.disconnect_events()
        sts_a = self.oscData.GetDictval('STS_a(us)')
        sts_s = self.oscData.GetDictval('STS_s(us)')
        ptp_a = self.oscData.GetDictval('PTP_a(us)')
        ptp_s = self.oscData.GetDictval('PTP_s(us)')
        self.oscData.SetDictval('STS_deltaT(us)', sts_a - sts_s if sts_a is not None and sts_s is not None else None)
        self.oscData.SetDictval('PTP_deltaT(us)', ptp_a - ptp_s if ptp_a is not None and ptp_s is not None else None)
        # Store current receiver data for next iteration
        OscilloDataAnalyzer._prev_receiver_time = self.Time.copy()
        OscilloDataAnalyzer._prev_receiver_data = self.Receiver.copy()

    def save_graph(self):
        # 時系列データを描画する関数
        with plt.style.context('hashi_normal_size'):
            self.fig, self.ax = plt.subplots(2, 1, figsize=(4.8, 3.2))
            # 上下のグラフ間のスペースを調整
            plt.subplots_adjust(hspace=0.5)
            # 右側の余白を調整
            plt.subplots_adjust(right=0.85)
            # 上のグラフ
            self.ax[0].set_ylabel('Trigger (V)')
            self.ax[0].set_xlabel('Time (us)')
            self.ax[0].plot(self.Time, self.Input, color='blue', label='Trigger')
            sts_s = self.oscData.GetDictval('STS_s(us)')
            ptp_s = self.oscData.GetDictval('PTP_s(us)')
            sts_a = self.oscData.GetDictval('STS_a(us)')
            ptp_a = self.oscData.GetDictval('PTP_a(us)')
            if sts_s is not None:
                self.ax[0].axvline(x=sts_s, color='red', label='STS start')
            if ptp_s is not None:
                self.ax[0].axvline(x=ptp_s, color='green', label='PTP start')
            # 下のグラフ
            self.ax[1].set_ylabel('Receiver (mV)')
            self.ax[1].set_xlabel('Time (us)')
            self.ax[1].plot(self.Time, self.Receiver * 1000, color='blue', label='Receiver')
            if sts_a is not None:
                self.ax[1].axvline(x=sts_a, color='red', label='STS arrival')
            if ptp_a is not None:
                self.ax[1].axvline(x=ptp_a, color='green', label='PTP arrival')
            self.ax[1].set_ylim(-max(abs(self.Receiver * 1000))*1.1, max(abs(self.Receiver * 1000))*1.1)
            for i in range(2):
                self.ax[i].grid(which='both', linestyle='--')
                self.ax[i].legend(loc='upper right',fancybox=False, facecolor="white",edgecolor="black",
                                labelspacing=0.1,ncol=1, fontsize=7).get_frame().set_linewidth(0.5)
            save_path = os.path.join(self.save_dir, self.oscData.GetFileNameWOext() + '.png')
            self.fig.savefig(save_path, dpi=400, transparent=True)
            plt.close(self.fig)

class OscilloDataAnalyzer_AutoAnalysis(OscilloDataAnalyzer):
    def __init__(self, oscData, save_dir, past10files_name=[], past10files_Trise=[], past10files_Rrise=[], past10files_Rpeak=[]):
        super().__init__(oscData, save_dir, past10files_name, past10files_Trise, past10files_Rrise, past10files_Rpeak)

    # 前回の解析結果をもとに自動で立ち上がりの時間をプロット&セットするバージョン
    def plot_initial_data(self):
        # 初期プロット関数
        # フィギュアとグラフ領域を作成
        self.fig = plt.figure(figsize=(10, 8))
        gs = GridSpec(2, 4, self.fig)  # 2行×2列のグリッド

        self.ax: list[Axes] = []
        self.ax.append(self.fig.add_subplot(gs[0, 0:3]))
        self.ax.append(self.fig.add_subplot(gs[1, 0:3]))
        table_ax = self.fig.add_subplot(gs[:, 3])
        table_ax.axis('off')
        self.ax.append(table_ax)

        # ax[0]: 左上
        self.ax[0] = self.fig.add_subplot(gs[0, 0:3])  # 1行目、1-3列目

        # ax[1]: 左下
        self.ax[1] = self.fig.add_subplot(gs[1, 0:3])  # 2行目、1-3列目

        # ax[2]: 右
        table_ax = self.fig.add_subplot(gs[:, 3])  # 1-2行目、4列目
        table_ax.axis('off')  # 軸を非表示にする
        self.ax[2] = table_ax  # テーブル用に登録

        self.lines = {self.ax[0]: [], self.ax[1]: []}  # 各グラフの線のリストを管理

        self.Time, self.Input, self.Receiver = self.oscData.GetALLdata()
        self.ax[0].set_title(self.oscData.GetFileNameWOext() + ' (Trigger)', fontname='Meiryo')
        self.ax[1].set_title(self.oscData.GetFileNameWOext() + ' (Receiver)', fontname='Meiryo')
        self.ax[0].plot(self.Time, self.Input, color='blue')
        
        # 前回の波形を半透明でプロット
        if OscilloDataAnalyzer._prev_receiver_time is not None and OscilloDataAnalyzer._prev_receiver_data is not None:
            norm_factor_prev = np.max(np.abs(OscilloDataAnalyzer._prev_receiver_data))
            self.ax[1].plot(OscilloDataAnalyzer._prev_receiver_time, OscilloDataAnalyzer._prev_receiver_data / norm_factor_prev, 
                            color='blue', alpha=0.3, linewidth=1)
        
        # Plot current receiver waveform (normalized by max absolute value for better visualization)
        norm_factor_current = np.max(np.abs(self.Receiver))
        self.ax[1].plot(self.Time, self.Receiver / norm_factor_current, color='blue')
        
        for i in range(2):
            self.ax[i].set_ylabel('Voltage (V)', fontname='Meiryo')
            self.ax[i].set_xlabel('Time (us)', fontname='Meiryo')
            self.ax[i].grid()
        
        if len(self.past_files_name) > 0 and len(self.past10files_Rpeak) > 0 and len(self.past10files_Rrise) > 0:
            # テーブルデータを準備
            table_data = list(zip(self.past_files_name, self.past10files_Rrise, self.past10files_Rpeak))  # 3列形式のデータを作成
            col_labels = ['Filename', 'STS_a(us)', 'PTP_a(us)']  # 列ラベル
            # テーブルを挿入
            table = table_ax.table(cellText=table_data, colLabels=col_labels, loc='center')
            table.auto_set_font_size(False)
            table.set_fontsize(10)
            table.auto_set_column_width(col=list(range(len(col_labels))))

            # 過去の最終時刻をもとに自動プロット & セット
            try:
                # === STS start 赤線（破線）===
                latest_start_time = float(self.past10files_Trise[-1])
                STS_index_s = np.abs(self.Time - latest_start_time).argmin()
                ln_start = self.ax[0].axvline(x=self.Time[STS_index_s], color="red", linestyle='--')
                self.lines[self.ax[0]].append(ln_start)
                ann_start = self.ax[0].annotate(
                    f'{self.Time[STS_index_s]:.1f}us',
                    xy=(self.Time[STS_index_s], self.ax[0].get_ylim()[1]),
                    xytext=(-50, -27),
                    textcoords='offset points',
                    fontsize=10,
                    color='red',
                    bbox=dict(boxstyle="round,pad=0.3", edgecolor='red',
                                facecolor='white')
                )
                self.lines[self.ax[0]].append(ann_start)
                # === oscData に格納 ===
                self.oscData.SetDictval('STS_s(us)', self.Time[STS_index_s])
                self.oscData.SetDictval('STS_s(V)', self.Input[STS_index_s])

                # === STS arrival 赤線（破線）===
                latest_arrival_time = float(self.past10files_Rrise[-1])
                STS_index_a = np.abs(self.Time - latest_arrival_time).argmin()
                ln_arrival = self.ax[1].axvline(x=self.Time[STS_index_a], color="red", linestyle='--')
                self.lines[self.ax[1]].append(ln_arrival)
                dif = self.Time[STS_index_a] - self.past10files_Rrise[-1] if len(self.past10files_Rrise) > 0 else 0
                annotation_sts = self.ax[1].annotate(
                    f'{self.Time[STS_index_a]:.1f}us\n(Δ{dif:.1f}us)',
                    xy=(self.Time[STS_index_a], self.ax[1].get_ylim()[1]),
                    xytext=(-50, -27),
                    textcoords='offset points',
                    fontsize=10,
                    color='red',
                    bbox=dict(boxstyle="round,pad=0.3", edgecolor='red', facecolor='white')
                )
                self.lines[self.ax[1]].append(annotation_sts)

                # === PTP arrival 緑線を自動判定（破線）===
                y_data = self.Receiver
                peaks, _ = find_peaks(y_data[STS_index_a:], width=50)
                if peaks.size > 0:
                    PTP_index_a = STS_index_a + peaks[0]
                else:
                    PTP_index_a = STS_index_a  # fallback

                ln_ptp = self.ax[1].axvline(x=self.Time[PTP_index_a], color="green", linestyle='--')
                self.lines[self.ax[1]].append(ln_ptp)
                dif = self.Time[PTP_index_a] - self.past10files_Rpeak[-1] if len(self.past10files_Rpeak) > 0 else 0
                annotation_ptp = self.ax[1].annotate(
                    f'{self.Time[PTP_index_a]:.1f}us\n(Δ{dif:.1f}us)',
                    xy=(self.Time[PTP_index_a], self.ax[1].get_ylim()[1]),
                    xytext=(7, -27),
                    textcoords='offset points',
                    fontsize=10,
                    color='green',
                    bbox=dict(boxstyle="round,pad=0.3", edgecolor='green', facecolor='white')
                )
                self.lines[self.ax[1]].append(annotation_ptp)

                # === oscData に格納 ===
                self.oscData.SetDictval('STS_a(us)', self.Time[STS_index_a])
                self.oscData.SetDictval('STS_a(V)', self.Receiver[STS_index_a])
                self.oscData.SetDictval('PTP_a(us)', self.Time[PTP_index_a])
                self.oscData.SetDictval('PTP_a(V)', self.Receiver[PTP_index_a])

            except Exception as e:
                print(f"[警告] エラー: {e}")

        # transmiterのピークを自動で検出
        PTP_index = np.argmax(self.Input)
        ln_PTP = self.ax[0].axvline(x=self.Time[PTP_index], color="green") # 線を描画
        self.lines[self.ax[0]].append(ln_PTP) # 線をリストに追加
        self.oscData.SetDictval('PTP_s(us)', self.Time[PTP_index])
        self.oscData.SetDictval('PTP_s(V)', self.Input[PTP_index])

        # 描画を更新
        self.fig.tight_layout()  # レイアウトを調整
        self.fig.canvas.draw()
        
        # Store the original x-axis limits
        self.x_min = self.Time.min()
        self.x_max = self.Time.max()
        
        # Apply the current zoom state
        self.update_zoom()



class OscilloDataAnalyzer_AutoAnalysisCC(OscilloDataAnalyzer_AutoAnalysis):
    """
    OscilloDataAnalyzer_AutoAnalysis を継承し、STS arrival（受信波の立ち上がり点）の
    初期推定値を「前回のreceiver波形」と「今回のreceiver波形」のクロスコリレーションによって
    得られる到達時間差Δを用いて補正するバージョン。

    クロスコリレーションは波形全体ではなく、前回のSTS arrival時刻から後ろ window_us [us]
    の範囲のみを対象に計算する。

        今回のSTS arrival推定値 = 前回のSTS arrival(us) + Δ
    として初期推定線を描画する。
    """

    def __init__(self, oscData, save_dir, past10files_name=[], past10files_Trise=[], past10files_Rrise=[], past10files_Rpeak=[], cc_window_us=150):
        super().__init__(oscData, save_dir, past10files_name, past10files_Trise, past10files_Rrise, past10files_Rpeak)
        # クロスコリレーションで求めたΔ(us)を保持（デバッグ・ログ用）
        self.cc_delta_t = None
        # クロスコリレーションの対象範囲（前回のSTS arrivalから後ろ何usを切り出すか）
        self.cc_window_us = cc_window_us

    def _compute_cc_delta(self, latest_arrival_time, window_us=100):
        """
        前回のreceiver波形 (OscilloDataAnalyzer._prev_receiver_time/_prev_receiver_data) と
        今回のreceiver波形 (self.Time, self.Receiver) のクロスコリレーションを取り、
        今回の波形が前回の波形に対してどれだけ時間的にずれているか（Δ, us）を返す。

        クロスコリレーションは波形全体ではなく、前回のSTS arrival時刻(latest_arrival_time)
        から後ろ window_us [us] の範囲のみを対象に計算する。

        Δ > 0 : 今回の波形が前回よりも「遅れて」到達している（右にシフト）
        Δ < 0 : 今回の波形が前回よりも「早く」到達している（左にシフト）

        引数:
            latest_arrival_time (float): 前回のSTS arrival時刻(us)。範囲切り出しの開始点。
            window_us (float): 前回のSTS arrival時刻から後ろに切り出す範囲の長さ(us)。デフォルト150us。

        前回データが存在しない場合は None を返す。
        """
        prev_time = OscilloDataAnalyzer_AutoAnalysis._prev_receiver_time
        prev_data = OscilloDataAnalyzer_AutoAnalysis._prev_receiver_data

        if prev_time is None or prev_data is None:
            return None

        # サンプリング間隔(us)を今回のTimeデータから推定
        dt = np.mean(np.diff(self.Time))
        if dt <= 0 or not np.isfinite(dt):
            return None

        # 前回のReceiver波形を、今回のTime軸に補間して長さ・サンプリング間隔を揃える
        prev_interp = np.interp(self.Time, prev_time, prev_data, left=0.0, right=0.0)
        curr = self.Receiver

        # 前回のSTS arrival時刻から後ろ window_us の範囲を切り出す
        window_start = latest_arrival_time
        window_end = latest_arrival_time + window_us
        window_mask = (self.Time >= window_start) & (self.Time <= window_end)

        if np.count_nonzero(window_mask) < 2:
            return None

        prev_window = prev_interp[window_mask]
        curr_window = curr[window_mask]

        # DC成分（平均値）を除去してから相関を取る
        prev_zeromean = prev_window - np.mean(prev_window)
        curr_zeromean = curr_window - np.mean(curr_window)

        # 正規化（振幅差の影響を軽減）
        prev_norm = np.max(np.abs(prev_zeromean))
        curr_norm = np.max(np.abs(curr_zeromean))
        if prev_norm == 0 or curr_norm == 0:
            return None
        prev_zeromean = prev_zeromean / prev_norm
        curr_zeromean = curr_zeromean / curr_norm

        # クロスコリレーション（'full'モード）
        corr = np.correlate(curr_zeromean, prev_zeromean, mode='full')

        # lag=0 は配列の中央 (len(prev_window)-1) に対応
        lag_index = np.argmax(corr) - (len(prev_zeromean) - 1)

        # lag_index > 0 : curr が prev に対して右にシフト（今回の方が遅れている）
        delta_t = lag_index * dt

        return delta_t

    # 前回の解析結果 + クロスコリレーションによるΔを用いて自動プロット＆セットするバージョン
    def plot_initial_data(self):
        # 初期プロット関数
        self.fig = plt.figure(figsize=(10, 8))
        gs = GridSpec(2, 4, self.fig)

        self.ax: list[Axes] = []
        self.ax.append(self.fig.add_subplot(gs[0, 0:3]))
        self.ax.append(self.fig.add_subplot(gs[1, 0:3]))
        table_ax = self.fig.add_subplot(gs[:, 3])
        table_ax.axis('off')
        self.ax.append(table_ax)

        self.ax[0] = self.fig.add_subplot(gs[0, 0:3])
        self.ax[1] = self.fig.add_subplot(gs[1, 0:3])
        table_ax = self.fig.add_subplot(gs[:, 3])
        table_ax.axis('off')
        self.ax[2] = table_ax

        self.lines = {self.ax[0]: [], self.ax[1]: []}

        self.Time, self.Input, self.Receiver = self.oscData.GetALLdata()
        self.ax[0].set_title(self.oscData.GetFileNameWOext() + ' (Trigger)', fontname='Meiryo')
        self.ax[1].set_title(self.oscData.GetFileNameWOext() + ' (Receiver)', fontname='Meiryo')
        self.ax[0].plot(self.Time, self.Input, color='blue')

        # 前回の波形を半透明でプロット
        if OscilloDataAnalyzer._prev_receiver_time is not None and OscilloDataAnalyzer._prev_receiver_data is not None:
            norm_factor_prev = np.max(np.abs(OscilloDataAnalyzer._prev_receiver_data))
            self.ax[1].plot(OscilloDataAnalyzer._prev_receiver_time, OscilloDataAnalyzer._prev_receiver_data / norm_factor_prev,
                            color='blue', alpha=0.3, linewidth=1)

        norm_factor_current = np.max(np.abs(self.Receiver))
        self.ax[1].plot(self.Time, self.Receiver / norm_factor_current, color='blue')

        for i in range(2):
            self.ax[i].set_ylabel('Voltage (V)', fontname='Meiryo')
            self.ax[i].set_xlabel('Time (us)', fontname='Meiryo')
            self.ax[i].grid()

        if len(self.past_files_name) > 0 and len(self.past10files_Rpeak) > 0 and len(self.past10files_Rrise) > 0:
            table_data = list(zip(self.past_files_name, self.past10files_Rrise, self.past10files_Rpeak))
            col_labels = ['Filename', 'STS_a(us)', 'PTP_a(us)']
            table = table_ax.table(cellText=table_data, colLabels=col_labels, loc='center')
            table.auto_set_font_size(False)
            table.set_fontsize(10)
            table.auto_set_column_width(col=list(range(len(col_labels))))

            try:
                # === STS start 赤線（破線）===（Trigger側は補正なし：従来通り）
                latest_start_time = float(self.past10files_Trise[-1])
                STS_index_s = np.abs(self.Time - latest_start_time).argmin()
                ln_start = self.ax[0].axvline(x=self.Time[STS_index_s], color="red", linestyle='--')
                self.lines[self.ax[0]].append(ln_start)
                ann_start = self.ax[0].annotate(
                    f'{self.Time[STS_index_s]:.1f}us',
                    xy=(self.Time[STS_index_s], self.ax[0].get_ylim()[1]),
                    xytext=(-50, -27),
                    textcoords='offset points',
                    fontsize=10,
                    color='red',
                    bbox=dict(boxstyle="round,pad=0.3", edgecolor='red', facecolor='white')
                )
                self.lines[self.ax[0]].append(ann_start)
                self.oscData.SetDictval('STS_s(us)', self.Time[STS_index_s])
                self.oscData.SetDictval('STS_s(V)', self.Input[STS_index_s])

                # === クロスコリレーションによるΔの算出 ===
                latest_arrival_time = float(self.past10files_Rrise[-1])
                delta_t = self._compute_cc_delta(latest_arrival_time, window_us=self.cc_window_us)
                self.cc_delta_t = delta_t

                if delta_t is not None:
                    # 前回のreceiver波形と今回のreceiver波形の相関から求めたΔ分だけずらした値を初期推定値とする
                    estimated_arrival_time = latest_arrival_time + delta_t
                else:
                    # 前回波形が無い場合は従来通り前回の値をそのまま使用
                    estimated_arrival_time = latest_arrival_time

                # === STS arrival 赤線（破線）：CC補正後の初期推定値 ===
                STS_index_a = np.abs(self.Time - estimated_arrival_time).argmin()
                ln_arrival = self.ax[1].axvline(x=self.Time[STS_index_a], color="red", linestyle='--')
                self.lines[self.ax[1]].append(ln_arrival)
                dif = self.Time[STS_index_a] - self.past10files_Rrise[-1] if len(self.past10files_Rrise) > 0 else 0
                delta_label = f'\n(CCΔ{delta_t:.2f}us)' if delta_t is not None else ''
                annotation_sts = self.ax[1].annotate(
                    f'{self.Time[STS_index_a]:.1f}us\n(Δ{dif:.1f}us){delta_label}',
                    xy=(self.Time[STS_index_a], self.ax[1].get_ylim()[1]),
                    xytext=(-50, -27),
                    textcoords='offset points',
                    fontsize=10,
                    color='red',
                    bbox=dict(boxstyle="round,pad=0.3", edgecolor='red', facecolor='white')
                )
                self.lines[self.ax[1]].append(annotation_sts)

                # === PTP arrival 緑線を自動判定（破線）：CC補正後のSTS基準で探索 ===
                y_data = self.Receiver
                peaks, _ = find_peaks(y_data[STS_index_a:], width=50)
                if peaks.size > 0:
                    PTP_index_a = STS_index_a + peaks[0]
                else:
                    PTP_index_a = STS_index_a

                ln_ptp = self.ax[1].axvline(x=self.Time[PTP_index_a], color="green", linestyle='--')
                self.lines[self.ax[1]].append(ln_ptp)
                dif = self.Time[PTP_index_a] - self.past10files_Rpeak[-1] if len(self.past10files_Rpeak) > 0 else 0
                annotation_ptp = self.ax[1].annotate(
                    f'{self.Time[PTP_index_a]:.1f}us\n(Δ{dif:.1f}us)',
                    xy=(self.Time[PTP_index_a], self.ax[1].get_ylim()[1]),
                    xytext=(7, -27),
                    textcoords='offset points',
                    fontsize=10,
                    color='green',
                    bbox=dict(boxstyle="round,pad=0.3", edgecolor='green', facecolor='white')
                )
                self.lines[self.ax[1]].append(annotation_ptp)

                # === oscData に格納 ===
                self.oscData.SetDictval('STS_a(us)', self.Time[STS_index_a])
                self.oscData.SetDictval('STS_a(V)', self.Receiver[STS_index_a])
                self.oscData.SetDictval('PTP_a(us)', self.Time[PTP_index_a])
                self.oscData.SetDictval('PTP_a(V)', self.Receiver[PTP_index_a])

            except Exception as e:
                print(f"[警告] エラー: {e}")

        # transmitterのピークを自動で検出
        PTP_index = np.argmax(self.Input)
        ln_PTP = self.ax[0].axvline(x=self.Time[PTP_index], color="green")
        self.lines[self.ax[0]].append(ln_PTP)
        self.oscData.SetDictval('PTP_s(us)', self.Time[PTP_index])
        self.oscData.SetDictval('PTP_s(V)', self.Input[PTP_index])

        self.fig.tight_layout()
        self.fig.canvas.draw()

        self.x_min = self.Time.min()
        self.x_max = self.Time.max()

        self.update_zoom()