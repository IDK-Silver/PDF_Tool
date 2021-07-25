//
// Created by a2882 on 2021/7/25.
//

#ifndef PDF_TOOL_SETTING_H
#define PDF_TOOL_SETTING_H

#include <QString>
#include <QSettings>
#include <QDir>


class Setting {
public:
    Setting(QString input_filepath, QString  section);
    explicit Setting(QString input_section);
    ~Setting();
    bool is_file_generate();
    void generate_file();
    void change_section(const QString &section);
    void write(const QString &key, const QString &value);
    void write(const QString &input_section, const QString &key, const QString &value);
    void write(const QString &input_section, const QString &key, const QStringList & values);
    QString read(const QString &key);

private:
    QSettings *settings;
    QString section;
    QString filepath;
    QString filename = "setting.ini";
};

namespace Setting_Sections {
    struct PDFWidget {
        QString section = "PDF-Widget-Option";
        struct keys {
            QString dpi_list = "DPI-List";
            QString format_list = {"Format-List"};
            QString dpi = "Last-Choose-DPi";
            QString format = "Last-Choose-Format";
        };
        keys key;
    };
}

#endif //PDF_TOOL_SETTING_H
