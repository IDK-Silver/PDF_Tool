//
// Created by a2882 on 2021/7/25.
//

#include "Setting.h"
#include <QDebug>
#include <utility>
#include <QDir>

Setting::Setting(QString input_filepath, QString input_section) : section(std::move(input_section)), filepath(std::move(input_filepath)) {
    this->settings = new QSettings(this->filepath, QSettings::IniFormat);
}

Setting::Setting(QString input_section) : section(std::move(input_section)){
    this->filepath =QDir::currentPath() + QDir::separator() + this->filename;
    this->settings = new QSettings(this->filepath, QSettings::IniFormat);
}

Setting::~Setting() {
    delete settings;
}

void Setting::write(const QString &key, const QString &value) {
    this->settings->setValue(this->section + "/" + key, value);
}

void Setting::write(const QString &input_section, const QString &input_key, const QString &input_value) {
    this->settings->setValue(input_section + "/" + input_key, input_value);
}

void Setting::write(const QString &input_section, const QString &input_key, const QStringList &values) {
    this->settings->setValue(input_section + "/" + input_key, values);
}

QString Setting::read(const QString &key) {
    return this->settings->value(this->section + "/" + key).toString();
}

void Setting::change_section(const QString &input_section) {
    this->section = input_section;
}

bool Setting::is_file_generate() {
    QDir qDir(this->filepath);
    return qDir.exists();
}

void Setting::generate_file() {

    {   // PDF Widget Option
        Setting_Sections::PDFWidget option;
        this->write(option.section, option.key.dpi, "300");
        this->write(option.section, option.key.format, "PNG");
        this->write(option.section, option.key.format_list, {"JPG", "PNG"});
        this->write(option.section, option.key.dpi_list, {"96", "300"});

    }
}












